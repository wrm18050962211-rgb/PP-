import { isMiniProgramRuntime, type MiniProgramLocation, wxGetLocation } from './miniProgramBridge';

export type ConsumerLocation = MiniProgramLocation;

export async function requestConsumerLocation(): Promise<ConsumerLocation> {
  if (isMiniProgramRuntime()) {
    return wxGetLocation();
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw locationError('unsupported', 'Current runtime does not support geolocation');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) => reject(locationError(error.code === error.PERMISSION_DENIED ? 'denied' : 'failed', error.message)),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

function locationError(code: 'unsupported' | 'denied' | 'failed', message: string) {
  const error = new Error(message);
  return Object.assign(error, { code });
}
