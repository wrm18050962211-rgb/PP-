import { createTencentSmsSender, hasTencentSmsConfig } from '../services/tencentSms.mjs';

const env = {
  TENCENT_CLOUD_SECRET_ID: 'test-secret-id',
  TENCENT_CLOUD_SECRET_KEY: 'test-secret-key',
  TENCENT_SMS_SDK_APP_ID: '1400000000',
  TENCENT_SMS_SIGN_NAME: 'Still',
  TENCENT_SMS_TEMPLATE_ID: '123456',
  TENCENT_SMS_REGION: 'ap-shanghai',
};
let capturedRequest = null;
const sender = createTencentSmsSender({
  env,
  clientFactory: async () => ({
    async SendSms(request) {
      capturedRequest = request;
      return {
        RequestId: 'request-test-1',
        SendStatusSet: [{ Code: 'Ok', Message: 'send success', SerialNo: 'serial-test-1' }],
      };
    },
  }),
});

const delivery = await sender.sendVerificationCode({
  phone: '13800138000',
  code: '123456',
  expiresInMinutes: 5,
  sessionContext: 'challenge-test-1',
});

assert(hasTencentSmsConfig(env), 'complete Tencent SMS configuration is recognized');
assert(capturedRequest.PhoneNumberSet[0] === '+8613800138000', 'phone number uses E.164 country code');
assert(capturedRequest.SmsSdkAppId === env.TENCENT_SMS_SDK_APP_ID, 'SDK app id is mapped');
assert(capturedRequest.SignName === env.TENCENT_SMS_SIGN_NAME, 'signature is mapped');
assert(capturedRequest.TemplateId === env.TENCENT_SMS_TEMPLATE_ID, 'template is mapped');
assert(capturedRequest.TemplateParamSet.join(',') === '123456,5', 'template parameters are mapped');
assert(capturedRequest.SessionContext === 'challenge-test-1', 'challenge id is sent as session context');
assert(delivery.providerRequestId === 'request-test-1', 'provider request id is returned');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['config', 'e164-phone', 'sdk-app', 'signature', 'template', 'parameters', 'request-id'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Tencent SMS check failed: ${message}`);
}
