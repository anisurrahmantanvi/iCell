import { Capacitor, registerPlugin } from '@capacitor/core'

/** True only inside the Android app. In a browser these helpers do nothing. */
export const isNative = (): boolean => Capacitor.isNativePlatform()

export interface CallSetupStatus {
  /** Notifications are allowed for iCell in Android settings. */
  notifications: boolean
  /** Incoming calls may take over the screen (Android 14 can switch this off). */
  fullScreenIntent: boolean
}

interface CallSetupPlugin {
  status(): Promise<CallSetupStatus>
  openFullScreenSettings(): Promise<void>
}

/** Small native helper written for iCell (mobile/CallSetupPlugin.java). */
export const CallSetup = registerPlugin<CallSetupPlugin>('CallSetup')
