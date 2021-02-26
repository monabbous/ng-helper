import {Inject, Injectable, InjectionToken} from '@angular/core';
import {BehaviorSubject, Observable, of, throwError} from 'rxjs';
import {NgForm} from '@angular/forms';
import {catchError, finalize, mergeMap, switchMap, take, takeWhile, tap} from 'rxjs/operators';
import {Router} from '@angular/router';
import {diggerStringParser} from '@monabbous/object-digger';


export const HELPER_CONFIG = new InjectionToken('HelperConfig');

export interface RefresherData {
  response: any;
  request: HelperRequest;
}

export type ConfirmOption = boolean | string | { message: string; confirm: string, cancel: string };

export interface HelperRequest {
  request: Observable<any>;
  form?: NgForm;
  refresher?: BehaviorSubject<RefresherData>;
  resetOnSuccess?: boolean;
  refreshOnError?: boolean;
  refreshOnSuccess?: boolean;
  confirm?: ConfirmOption;
  redirectTo?: string | {
    success?: string;
    error?: string;
  };
  extra?: any;

  [key: string]: any;
}

export interface HelperNgFormErrors {
  [key: string]: any;
}

export interface HelperConfig {
  confirmationObservable?: (request: HelperRequest) => Observable<boolean>;
  responseMap?: (response: any, request: HelperRequest) => Observable<any>;
  catchError?: (response: any, request: HelperRequest) => Observable<any>;
  ngFormErrorInjector?: (response: any, request: HelperRequest) => HelperNgFormErrors;
  onSuccess?: (response: any, request: HelperRequest) => void;
  onError?: (response: any, request: HelperRequest) => void;
  helperFunctions?: {
    [key: string]: (...args: any[]) => any
  };
}

@Injectable({
  providedIn: 'root'
})
export class HelperService {
  public helpersFunctions: { [p: string]: (...args: any[]) => any };

  constructor(
    private router: Router,
    @Inject(HELPER_CONFIG) public config: HelperConfig,
  ) {
    this.helpersFunctions = config.helperFunctions || {};
  }


  request(request: HelperRequest) {
    if (request.form) {
      request.form.form.disable();
    }

    let successRedirect = null;
    let errorRedirect = null;
    if (![undefined, null].includes(request.redirectTo)) {
      if (typeof request.redirectTo === 'string') {
        successRedirect = errorRedirect = request.redirectTo;
      } else {
        if (![undefined, null].includes(request.redirectTo.success)) {
          successRedirect = request.redirectTo.success;
        }

        if (![undefined, null].includes(request.redirectTo.error)) {
          errorRedirect = request.redirectTo.error;
        }
      }
    }

    of(true)
      .pipe(
        take(1),
        mergeMap((confirm) => {
          if (request.confirm && this.config.confirmationObservable) {
            return this.config.confirmationObservable(request);
          }
          return of(confirm);
        }),
        takeWhile((confirm) => confirm),
        mergeMap(() => request.request),
        catchError(response => this.config?.catchError ? this.config?.catchError(response, request) : throwError(response)),
        switchMap(response => this.config?.responseMap ? this.config?.responseMap(response, request) : of(response)),
        catchError(response => {
          if (this.config.ngFormErrorInjector) {
            const injector = this.config.ngFormErrorInjector(response, request);
            return (injector instanceof Observable ? injector : of(injector))
              .pipe(
                tap(errors => {
                  for (const key of Object.keys(errors)) {
                    const control = request.form.form.get(key.split('.'));
                    if (control) {
                      let shown = false;
                      control.setAsyncValidators(() => {
                        if (shown) {
                          return request.form.ngSubmit
                            .pipe(
                              mergeMap(() => of(''))
                            );
                        } else {
                          shown = true;
                          return of(errors[key]);
                        }
                      });
                    }
                  }
                  const first = Object.keys(errors).shift();
                  if (first) {
                    const lastKey = first.split('.').pop();
                    if (lastKey) {
                      const firstInput = document.querySelector(`[name=${lastKey}]:not([type=hidden])`);
                      if (firstInput) {
                        const offset = firstInput.getBoundingClientRect().top + window.pageYOffset - (window.innerHeight * .5);
                        window.scrollTo({top: offset, behavior: 'smooth'});
                      }
                    }
                  }
                })
              );
          }
          return throwError(response);
        }),
        catchError((response) => {
          if (request.refresher && request.refreshOnError) {
            request.refresher.next({response, request});
          }

          if (this.config.onError) {
            this.config.onError(response, request);
          }

          if (![undefined, null].includes(errorRedirect)) {
            this.requestRedirect(errorRedirect, response, request);
          }
          return throwError(response);
        }),
        tap((response) => {
          if (request.refresher && request.refreshOnSuccess) {
            request.refresher.next({response, request});
          }

          if (this.config.onSuccess) {
            this.config.onSuccess(response, request);
          }

          if (![undefined, null].includes(successRedirect)) {
            this.requestRedirect(successRedirect, response, request);
          }
        }),
        finalize(() => {
          if (request.form) {
            request.form.form.enable();
          }
        }),
      ).subscribe();
  }


  requestRedirect(url: string, response: any, request: HelperRequest) {
    const context = {
      response,
      request,
    };

    this.router.navigateByUrl(diggerStringParser(url, context));

  }
}
