const requiredTencentSmsEnvNames = [
  'TENCENT_CLOUD_SECRET_ID',
  'TENCENT_CLOUD_SECRET_KEY',
  'TENCENT_SMS_SDK_APP_ID',
  'TENCENT_SMS_SIGN_NAME',
  'TENCENT_SMS_TEMPLATE_ID',
];

export const tencentSmsDefaults = Object.freeze({
  countryCode: '+86',
  region: 'ap-shanghai',
  templateParamOrder: 'code,expiresInMinutes',
});

export function hasTencentSmsConfig(env = process.env) {
  return getTencentSmsConfigIssues(env).length === 0;
}

export function getMissingTencentSmsConfig(env = process.env) {
  return requiredTencentSmsEnvNames.filter((name) => !String(env[name] || '').trim());
}

export function getTencentSmsConfigIssues(env = process.env) {
  const issues = getMissingTencentSmsConfig(env).map((name) => `${name} is required`);
  const sdkAppId = String(env.TENCENT_SMS_SDK_APP_ID || '').trim();
  const templateId = String(env.TENCENT_SMS_TEMPLATE_ID || '').trim();
  const countryCode = String(env.TENCENT_SMS_COUNTRY_CODE || tencentSmsDefaults.countryCode).trim();
  const templateParamOrder = String(env.TENCENT_SMS_TEMPLATE_PARAM_ORDER || tencentSmsDefaults.templateParamOrder).trim();
  const region = String(env.TENCENT_SMS_REGION || tencentSmsDefaults.region).trim();

  if (sdkAppId && !/^\d{6,20}$/.test(sdkAppId)) issues.push('TENCENT_SMS_SDK_APP_ID must be numeric');
  if (templateId && !/^\d{1,20}$/.test(templateId)) issues.push('TENCENT_SMS_TEMPLATE_ID must be numeric');
  if (countryCode !== tencentSmsDefaults.countryCode) issues.push('TENCENT_SMS_COUNTRY_CODE must be +86');
  if (templateParamOrder !== tencentSmsDefaults.templateParamOrder) {
    issues.push('TENCENT_SMS_TEMPLATE_PARAM_ORDER must be code,expiresInMinutes');
  }
  if (!/^[a-z]{2}-[a-z0-9-]+$/i.test(region)) issues.push('TENCENT_SMS_REGION is invalid');
  return issues;
}

export function createTencentSmsSender({ env = process.env, clientFactory } = {}) {
  return {
    async sendVerificationCode({ phone, code, expiresInMinutes, sessionContext }) {
      const config = readTencentSmsConfig(env);

      let response;
      try {
        const client = clientFactory
          ? await clientFactory(env)
          : await createTencentSmsClient(env);
        response = await client.SendSms({
          PhoneNumberSet: [`${config.countryCode}${phone}`],
          SmsSdkAppId: config.sdkAppId,
          SignName: config.signName,
          TemplateId: config.templateId,
          TemplateParamSet: [code, String(expiresInMinutes)],
          SessionContext: sessionContext,
        });
      } catch (error) {
        throw stableProviderError(error?.code);
      }
      const sendStatus = response?.SendStatusSet?.[0];
      if (!sendStatus || sendStatus.Code !== 'Ok') {
        throw stableProviderError(sendStatus?.Code, 'rejected');
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
  if (!SmsClient) throw stableProviderError(null);
  return new SmsClient({
    credential: {
      secretId: String(env.TENCENT_CLOUD_SECRET_ID).trim(),
      secretKey: String(env.TENCENT_CLOUD_SECRET_KEY).trim(),
    },
    region: String(env.TENCENT_SMS_REGION || tencentSmsDefaults.region).trim(),
    profile: {
      httpProfile: {
        endpoint: 'sms.tencentcloudapi.com',
      },
    },
  });
}

function readTencentSmsConfig(env) {
  const issues = getTencentSmsConfigIssues(env);
  if (issues.length) {
    const error = new Error(`Tencent SMS configuration is invalid: ${issues.join('; ')}`);
    error.code = 'SMS_NOT_CONFIGURED';
    throw error;
  }
  return {
    sdkAppId: String(env.TENCENT_SMS_SDK_APP_ID).trim(),
    signName: String(env.TENCENT_SMS_SIGN_NAME).trim(),
    templateId: String(env.TENCENT_SMS_TEMPLATE_ID).trim(),
    countryCode: String(env.TENCENT_SMS_COUNTRY_CODE || tencentSmsDefaults.countryCode).trim(),
  };
}

function stableProviderError(providerCode, fallback = 'unavailable') {
  const normalizedCode = String(providerCode || '');
  const rateLimited = /(limit|frequency|throttl|requestlimit)/i.test(normalizedCode);
  const error = new Error(
    rateLimited
      ? 'SMS provider rate limit reached.'
      : fallback === 'rejected'
        ? 'SMS provider rejected the request.'
        : 'SMS provider is unavailable.',
  );
  error.code = rateLimited
    ? 'SMS_PROVIDER_RATE_LIMITED'
    : fallback === 'rejected'
      ? 'SMS_PROVIDER_REJECTED'
      : 'SMS_PROVIDER_UNAVAILABLE';
  return error;
}
