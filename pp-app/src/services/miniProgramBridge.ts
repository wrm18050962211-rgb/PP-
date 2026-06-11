import type { PaymentRequest } from '../types/api';

export type MiniProgramLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
};

type WxRequestOptions = {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: unknown;
  header?: Record<string, string>;
  success?: (response: { statusCode: number; data: unknown }) => void;
  fail?: (error: unknown) => void;
};

type WxLoginOptions = {
  success?: (response: { code?: string }) => void;
  fail?: (error: unknown) => void;
};

type WxLocationOptions = {
  type?: 'wgs84' | 'gcj02';
  isHighAccuracy?: boolean;
  success?: (response: { latitude: number; longitude: number; accuracy?: number }) => void;
  fail?: (error: unknown) => void;
};

type WxUploadFileOptions = {
  url: string;
  filePath: string;
  name: string;
  formData?: Record<string, string>;
  header?: Record<string, string>;
  success?: (response: { statusCode: number; data: string }) => void;
  fail?: (error: unknown) => void;
};

type WxPaymentOptions = PaymentRequest['miniProgramPayParams'] & {
  success?: () => void;
  fail?: (error: unknown) => void;
};

export type MiniProgramWxBridge = {
  request?: (options: WxRequestOptions) => void;
  login?: (options: WxLoginOptions) => void;
  getLocation?: (options: WxLocationOptions) => void;
  uploadFile?: (options: WxUploadFileOptions) => void;
  requestPayment?: (options: WxPaymentOptions) => void;
};

export function getWxBridge(): MiniProgramWxBridge | null {
  const maybeWx = (globalThis as { wx?: MiniProgramWxBridge }).wx;
  return maybeWx || null;
}

export function isMiniProgramRuntime() {
  const wx = getWxBridge();
  return Boolean(wx?.request || wx?.login || wx?.requestPayment);
}

export function wxRequest<T>(url: string, method: 'GET' | 'POST', data?: unknown): Promise<T> {
  const wx = getWxBridge();
  if (!wx?.request) throw new Error('wx.request is not available');

  return new Promise((resolve, reject) => {
    wx.request?.({
      url,
      method,
      data,
      header: { 'Content-Type': 'application/json' },
      success: (response) => resolve(response.data as T),
      fail: reject,
    });
  });
}

export function wxLogin(): Promise<string> {
  const wx = getWxBridge();
  if (!wx?.login) throw new Error('wx.login is not available');

  return new Promise((resolve, reject) => {
    wx.login?.({
      success: (response) => {
        if (response.code) resolve(response.code);
        else reject(new Error('wx.login did not return code'));
      },
      fail: reject,
    });
  });
}

export function wxGetLocation(): Promise<MiniProgramLocation> {
  const wx = getWxBridge();
  if (!wx?.getLocation) throw new Error('wx.getLocation is not available');

  return new Promise((resolve, reject) => {
    wx.getLocation?.({
      type: 'gcj02',
      isHighAccuracy: true,
      success: (response) =>
        resolve({
          lat: response.latitude,
          lng: response.longitude,
          accuracy: response.accuracy,
        }),
      fail: reject,
    });
  });
}

export function wxUploadFile(url: string, filePath: string, formData?: Record<string, string>): Promise<string> {
  const wx = getWxBridge();
  if (!wx?.uploadFile) throw new Error('wx.uploadFile is not available');

  return new Promise((resolve, reject) => {
    wx.uploadFile?.({
      url,
      filePath,
      name: 'file',
      formData,
      success: (response) => resolve(response.data),
      fail: reject,
    });
  });
}

export function wxRequestPayment(params: PaymentRequest['miniProgramPayParams']): Promise<void> {
  const wx = getWxBridge();
  if (!wx?.requestPayment) throw new Error('wx.requestPayment is not available');

  return new Promise((resolve, reject) => {
    wx.requestPayment?.({
      ...params,
      success: () => resolve(),
      fail: reject,
    });
  });
}
