import {
  createTencentSmsSender,
  getTencentSmsConfigIssues,
  hasTencentSmsConfig,
} from '../services/tencentSms.mjs';

const env = {
  TENCENT_CLOUD_SECRET_ID: 'not-a-real-credential',
  TENCENT_CLOUD_SECRET_KEY: 'not-a-real-credential',
  TENCENT_SMS_SDK_APP_ID: '1401165754',
  TENCENT_SMS_SIGN_NAME: '上海帧遇科技有限公司',
  TENCENT_SMS_TEMPLATE_ID: '2694662',
  TENCENT_SMS_REGION: 'ap-shanghai',
  TENCENT_SMS_COUNTRY_CODE: '+86',
  TENCENT_SMS_TEMPLATE_PARAM_ORDER: 'code,expiresInMinutes',
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
assert(getTencentSmsConfigIssues(env).length === 0, 'confirmed Tencent SMS settings pass validation');
assert(capturedRequest.PhoneNumberSet[0] === '+8613800138000', 'phone number uses the configured +86 country code');
assert(capturedRequest.SmsSdkAppId === env.TENCENT_SMS_SDK_APP_ID, 'SDK app id is mapped');
assert(capturedRequest.SignName === env.TENCENT_SMS_SIGN_NAME, 'signature is mapped');
assert(capturedRequest.TemplateId === env.TENCENT_SMS_TEMPLATE_ID, 'template is mapped');
assert(capturedRequest.TemplateParamSet.join(',') === '123456,5', 'template parameters keep the confirmed order');
assert(capturedRequest.SessionContext === 'challenge-test-1', 'challenge id is sent as session context');
assert(delivery.providerRequestId === 'request-test-1', 'provider request id is returned');

const invalidCountryEnv = { ...env, TENCENT_SMS_COUNTRY_CODE: '+1' };
assert(!hasTencentSmsConfig(invalidCountryEnv), 'non-mainland country configuration is rejected');
assert(
  getTencentSmsConfigIssues(invalidCountryEnv).some((issue) => issue.includes('TENCENT_SMS_COUNTRY_CODE')),
  'country validation identifies the invalid setting',
);

const invalidOrderEnv = { ...env, TENCENT_SMS_TEMPLATE_PARAM_ORDER: 'expiresInMinutes,code' };
assert(!hasTencentSmsConfig(invalidOrderEnv), 'incorrect template parameter order is rejected');

await assertSenderError(
  createTencentSmsSender({
    env,
    clientFactory: async () => ({
      async SendSms() {
        return {
          SendStatusSet: [{ Code: 'FailedOperation.TemplateIncorrect', Message: 'provider-private-detail' }],
        };
      },
    }),
  }),
  'SMS_PROVIDER_REJECTED',
  'provider rejection uses a stable error',
);

await assertSenderError(
  createTencentSmsSender({
    env,
    clientFactory: async () => ({
      async SendSms() {
        const error = new Error('provider-private-detail');
        error.code = 'LimitExceeded.PhoneNumberDailyLimit';
        throw error;
      },
    }),
  }),
  'SMS_PROVIDER_RATE_LIMITED',
  'provider rate limit uses a stable error',
);

await assertSenderError(
  createTencentSmsSender({
    env,
    clientFactory: async () => ({
      async SendSms() {
        throw new Error('provider-private-detail');
      },
    }),
  }),
  'SMS_PROVIDER_UNAVAILABLE',
  'provider transport failure uses a stable error',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'confirmed-config',
        'mainland-country',
        'sdk-app',
        'signature',
        'template',
        'parameter-order',
        'request-id',
        'invalid-config',
        'stable-provider-rejection',
        'stable-provider-rate-limit',
        'stable-provider-unavailable',
      ],
    },
    null,
    2,
  ),
);

async function assertSenderError(testSender, expectedCode, message) {
  try {
    await testSender.sendVerificationCode({
      phone: '13800138000',
      code: '123456',
      expiresInMinutes: 5,
      sessionContext: 'challenge-error-test',
    });
  } catch (error) {
    assert(error?.code === expectedCode, `${message} (${expectedCode})`);
    assert(!error.message.includes('provider-private-detail'), `${message} does not expose provider details`);
    return;
  }
  throw new Error(`Tencent SMS check failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Tencent SMS check failed: ${message}`);
}
