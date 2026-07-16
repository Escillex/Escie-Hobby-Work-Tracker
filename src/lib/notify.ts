import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

let granted: boolean | null = null;

export async function notify(title: string, body: string): Promise<void> {
  if (granted === null) {
    granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
  }
  if (granted) {
    sendNotification({ title, body });
  }
}
