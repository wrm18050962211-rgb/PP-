const requiredTencentSmsEnvNames = [
  'TENCENT_CLOUD_SECRET_ID',
  'TENCENT_CLOUD_SECRET_KEY',
  'TENCENT_SMS_SDK_APP_ID',
  'TENCENT_SMS_SIGN_NAME',
  'TENCENT_SMS_TEMPLATE_ID',
];

export function hasTencentSmsConfig(env = process.env) {
  return requiredTencentSmsEnvNames.every((name) => Boolean(String(env[name] || '').trim()));
}

export function getMissingTencentSmsConfig(env = process.env) {
  return requiredTencentSmsEnvNames.filter((name) => !String(env[name] || '').trim());
}

export function createTencentSmsSender({ env = process.env, clientFactory } = {}) {
  return {
    async sendVerificationCode({ phone, code, expiresInMinutes, sessionContext }) {
      const missing = getMissingTencentSmsConfig(env);
      if (missing.length) {
        const error = new Error(`Tencent SMS configuration is incomplete: ${missing.join(', ')}`);
        error.code = 'SMS_NOT_CONFIGURED';
        throw error;
      }

      const client = clientFactory
        ? await clientFactory(env)
        : await createTencentSmsClient(env);
      const response = await client.SendSms({
        PhoneNumberSet: [`+86${phone}`],
        SmsSdkAppId: String(env.TENCENT_SMS_SDK_APP_ID).trim(),
        SignName: String(env.TENCENT_SMS_SIGN_NAME).trim(),
        TemplateId: String(env.TENCENT_SMS_TEMPLATE_ID).trim(),
        TemplateParamSet: [code, String(expiresInMinutes)],
        SessionContext: sessionContext,
      });
      const sendStatus = response?.SendStatusSet?.[0];
      if (!sendStatus || sendStatus.Code !== 'Ok') {
        const error = new Error(sendStatus?.Message || 'Tencent SMS rejected the verification message.');
        error.code = sendStatus?.Code || 'SMS_PROVIDER_REJECTED';
        throw error;
      }

      return {
        providerRequestId: response.RequestId || sendStatus.SerialNo || null,
      };
    },
  };
}

export function createMockSmsSender() {
  return {
    async sendVerificationCode() {
      return { providerRequestId: null };
    },
  };
}

async function createTencentSmsClient(env) {
  const sdk = await import('tencentcloud-sdk-nodejs-sms');
  const SmsClient = (sdk.sms || sdk.default?.sms)?.v20210111?.Client;
  if (!SmsClient) throw new Error('Tencent SMS SDK client is unavailable.');
  return new SmsClient({
    credential: {
      secretId: String(env.TENCENT_CLOUD_SECRET_ID).trim(),
      secretKey: String(env.TENCENT_CLOUD_SECRET_KEY).trim(),
    },
    region: String(env.TENCENT_SMS_REGION || 'ap-guangzhou').trim(),
    profile: {
      httpProfile: {
        endpoint: 'sms.tencentcloudapi.com',
      },
    },
  });
}
