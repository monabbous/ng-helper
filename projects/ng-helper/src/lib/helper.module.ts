import {ModuleWithProviders, NgModule} from '@angular/core';
import {HELPER_CONFIG, HelperConfig, HelperService} from './helper.service';

// @dynamic
@NgModule({
  providers: [
    HelperService,
  ],
})
export class HelperModule {
  static forRoot(config: HelperConfig): ModuleWithProviders<HelperModule> {
    return {
      ngModule: HelperModule,
      providers: [
        {
          provide: HELPER_CONFIG, useValue: config
        }
      ]
    };
  }
}
