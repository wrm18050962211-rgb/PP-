import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  FileCheck2,
  ImagePlus,
  MapPin,
  Phone,
  ShieldCheck,
  Upload,
  UserRound,
  Video,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { Chip } from '../../components/Chip';
import type { CompanionApplication } from '../../types/domain';

const cityOptions = ['上海', '北京', '广州', '深圳', '杭州', '成都', '南京', '苏州'];
const areas = ['徐家汇', '静安寺', '新天地', '外滩', '南京西路', '淮海中路', '陆家嘴', '人民广场'];
const services = ['户外街拍', 'Citywalk', '商圈逛街', '餐厅探店', '咖啡店', '展览', '美术馆', '夜景散步', '景点旅行', '室内空间'];
const tags = ['会指导动作', '轻松聊天', '懂女生需求', '适合第一次拍照'];

export function CompanionOnboarding() {
  const { application, saveApplication, submitApplication } = useAppData();
  const auditItems = getAuditItems(application);
  const completedCount = auditItems.filter((item) => item.done).length;
  const canSubmit = completedCount === auditItems.length && application.reviewStatus !== '待审核' && application.reviewStatus !== '已通过';

  function toggleItem(field: 'areas' | 'services' | 'tags', item: string) {
    const current = application[field];
    const next = current.includes(item) ? current.filter((value) => value !== item) : [...current, item];
    saveApplication({ [field]: next });
  }

  function setSingleFile(field: keyof CompanionApplication, fileList: FileList | null) {
    const file = fileList?.[0];
    if (file) saveApplication({ [field]: file.name });
  }

  function setMultiFiles(field: 'lifePhotos' | 'portfolioSamples', fileList: FileList | null) {
    const files = Array.from(fileList ?? []).map((file) => file.name);
    if (files.length) saveApplication({ [field]: files });
  }

  function verifyPhone() {
    if (/^1[3-9]\d{9}$/.test(application.phone.trim())) {
      saveApplication({ phoneVerified: true });
    }
  }

  function startFaceCheck() {
    saveApplication({ faceCheckStatus: 'processing' });
    window.setTimeout(() => saveApplication({ faceCheckStatus: 'passed' }), 400);
  }

  return (
    <div className="px-4 py-5">
      <Header title="陪拍者入驻审核" />

      <ReviewStatusPanel application={application} completedCount={completedCount} totalCount={auditItems.length} />

      <section className="mt-5 space-y-3">
        {auditItems.map(({ icon: Icon, label, done, desc }) => (
          <div key={label} className="flex w-full items-center gap-3 rounded-[10px] border border-zinc-200 bg-white p-4 text-left">
            <span className={`grid h-10 w-10 place-items-center rounded-full ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
              <Icon size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{label}</span>
              <span className="mt-0.5 block truncate text-xs text-zinc-500">{desc}</span>
            </span>
            {done ? <CheckCircle2 className="text-emerald-600" size={20} /> : <Clock3 className="text-zinc-300" size={20} />}
          </div>
        ))}
      </section>

      <FormBlock title="1. 手机号验证">
        <div className="flex gap-2">
          <input
            className="field"
            inputMode="tel"
            placeholder="手机号"
            value={application.phone}
            onChange={(event) => saveApplication({ phone: event.target.value, phoneVerified: false })}
          />
          <button className="h-11 shrink-0 rounded-full bg-zinc-950 px-4 text-sm font-bold text-white" onClick={verifyPhone}>
            {application.phoneVerified ? '已验证' : '验证'}
          </button>
        </div>
      </FormBlock>

      <FormBlock title="2. 实名与证件认证">
        <input className="field" placeholder="真实姓名" value={application.realName} onChange={(event) => saveApplication({ realName: event.target.value })} />
        <select className="field" value={application.idType} onChange={(event) => saveApplication({ idType: event.target.value as CompanionApplication['idType'] })}>
          <option value="id_card">居民身份证</option>
          <option value="passport">护照</option>
          <option value="other">其他有效证件</option>
        </select>
        <input className="field" placeholder="证件号码" value={application.idNumber} onChange={(event) => saveApplication({ idNumber: event.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <UploadField label="证件人像面" value={application.idFrontImage} accept="image/*" onChange={(files) => setSingleFile('idFrontImage', files)} />
          <UploadField label="证件国徽面" value={application.idBackImage} accept="image/*" onChange={(files) => setSingleFile('idBackImage', files)} />
        </div>
      </FormBlock>

      <FormBlock title="3. 人脸识别占位流程">
        <div className="rounded-[10px] border border-dashed border-zinc-300 p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100">
              <ShieldCheck size={19} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold">{faceStatusText[application.faceCheckStatus]}</p>
              <p className="mt-0.5 text-xs text-zinc-500">MVP 先模拟活体检测，后续接入三方认证接口。</p>
            </div>
          </div>
          <button className="mt-4 h-11 w-full rounded-full bg-zinc-950 text-sm font-bold text-white" onClick={startFaceCheck}>
            {application.faceCheckStatus === 'passed' ? '重新识别' : '开始人脸识别'}
          </button>
        </div>
      </FormBlock>

      <FormBlock title="4. Base 城市与服务资料">
        <select className="field" value={application.city} onChange={(event) => saveApplication({ city: event.target.value })}>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <input className="field" placeholder="昵称，例如 Mori" value={application.nickname} onChange={(event) => saveApplication({ nickname: event.target.value })} />
        <textarea
          className="field min-h-24 resize-none rounded-[10px] py-3"
          placeholder="自我介绍，说明陪伴感、拍摄风格和边界感"
          value={application.bio}
          onChange={(event) => saveApplication({ bio: event.target.value })}
        />
      </FormBlock>

      <ChoiceBlock title="服务区域" items={areas} selected={application.areas} onToggle={(item) => toggleItem('areas', item)} />
      <ChoiceBlock title="可接活动" items={services} selected={application.services} onToggle={(item) => toggleItem('services', item)} />
      <ChoiceBlock title="风格标签" items={tags} selected={application.tags} onToggle={(item) => toggleItem('tags', item)} />

      <FormBlock title="5. 紧急联系人">
        <input className="field" placeholder="联系人姓名" value={application.emergencyContactName} onChange={(event) => saveApplication({ emergencyContactName: event.target.value })} />
        <input className="field" placeholder="关系，例如朋友 / 家人" value={application.emergencyContactRelation} onChange={(event) => saveApplication({ emergencyContactRelation: event.target.value })} />
        <input className="field" inputMode="tel" placeholder="联系人手机号" value={application.emergencyContactPhone} onChange={(event) => saveApplication({ emergencyContactPhone: event.target.value })} />
      </FormBlock>

      <FormBlock title="6. 形象与作品素材">
        <UploadField label="真人头像" value={application.avatarImage} accept="image/*" onChange={(files) => setSingleFile('avatarImage', files)} />
        <UploadField label="生活照，至少 2 张" value={fileSummary(application.lifePhotos)} accept="image/*" multiple onChange={(files) => setMultiFiles('lifePhotos', files)} />
        <UploadField label="自我介绍视频" value={application.introVideo} accept="video/*" onChange={(files) => setSingleFile('introVideo', files)} />
        <UploadField label="作品样片，至少 3 张" value={fileSummary(application.portfolioSamples)} accept="image/*" multiple onChange={(files) => setMultiFiles('portfolioSamples', files)} />
      </FormBlock>

      <FormBlock title="7. 价格设置">
        <input className="field" placeholder="Citywalk 2小时，例如 399" value={application.price} onChange={(event) => saveApplication({ price: event.target.value })} />
        <input className="field" placeholder="加购项，例如 精修 30元/张" value={application.extra} onChange={(event) => saveApplication({ extra: event.target.value })} />
      </FormBlock>

      <section className="mt-6 rounded-[10px] bg-zinc-100 p-4">
        <label className="flex items-start gap-3">
          <input
            className="mt-1 h-4 w-4 accent-rose-500"
            type="checkbox"
            checked={application.rulesConfirmed}
            onChange={(event) => saveApplication({ rulesConfirmed: event.target.checked })}
          />
          <span className="text-sm leading-6 text-zinc-700">
            我已阅读并确认平台规则：不私下交易、不诱导站外沟通、按约定时间地点服务、尊重用户隐私与安全边界。
          </span>
        </label>
      </section>

      {!canSubmit && application.reviewStatus !== '待审核' && application.reviewStatus !== '已通过' && (
        <p className="mt-4 rounded-[10px] bg-amber-50 p-3 text-sm text-amber-800">请补齐未完成项目后再提交审核。</p>
      )}

      <button
        className={`mt-4 h-12 w-full rounded-full text-sm font-bold text-white ${canSubmit ? 'bg-rose-500' : 'bg-zinc-300'}`}
        disabled={!canSubmit}
        onClick={submitApplication}
      >
        {application.reviewStatus === '待审核' ? '已提交审核' : application.reviewStatus === '已通过' ? '审核已通过' : '提交审核'}
      </button>
    </div>
  );
}

const faceStatusText = {
  not_started: '未开始人脸识别',
  processing: '识别中',
  passed: '人脸识别已通过',
};

function getAuditItems(application: CompanionApplication) {
  return [
    {
      icon: Phone,
      label: '手机号验证',
      desc: application.phoneVerified ? application.phone : '用于接单安全通知',
      done: application.phoneVerified,
    },
    {
      icon: FileCheck2,
      label: '实名与证件认证',
      desc: '真实姓名、证件号、证件照片',
      done: Boolean(application.realName && application.idNumber && application.idFrontImage && application.idBackImage),
    },
    {
      icon: ShieldCheck,
      label: '人脸识别',
      desc: 'MVP 模拟通过，后续接三方活体',
      done: application.faceCheckStatus === 'passed',
    },
    {
      icon: MapPin,
      label: 'Base 城市与服务范围',
      desc: '城市、区域、活动类型',
      done: Boolean(application.city && application.areas.length && application.services.length),
    },
    {
      icon: UserRound,
      label: '紧急联系人',
      desc: '安全事件时平台可快速联系',
      done: Boolean(application.emergencyContactName && application.emergencyContactRelation && application.emergencyContactPhone),
    },
    {
      icon: ImagePlus,
      label: '头像与生活照',
      desc: '真人头像 + 至少 2 张生活照',
      done: Boolean(application.avatarImage && application.lifePhotos.length >= 2),
    },
    {
      icon: Video,
      label: '介绍视频与作品样片',
      desc: '自我介绍视频 + 至少 3 张作品样片',
      done: Boolean(application.introVideo && application.portfolioSamples.length >= 3),
    },
    {
      icon: BadgeCheck,
      label: '平台规则确认',
      desc: '接单前必须确认平台安全规则',
      done: application.rulesConfirmed,
    },
  ];
}

function ReviewStatusPanel({ application, completedCount, totalCount }: { application: CompanionApplication; completedCount: number; totalCount: number }) {
  const percent = Math.round((completedCount / totalCount) * 100);
  const statusCopy =
    application.reviewStatus === '待审核'
      ? '资料已提交，等待运营审核。审核通过前暂不可接单。'
      : application.reviewStatus === '已通过'
        ? '审核已通过，可以开始配置档期并接单。'
        : application.reviewStatus === '需修改'
          ? '运营要求修改资料，请补充后重新提交。'
          : '请完成全部入驻资料，提交后进入运营审核。';

  return (
    <section className="mt-5 rounded-[10px] bg-zinc-950 p-5 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-white/70">审核状态页</p>
          <h2 className="mt-1 text-2xl font-bold">{application.reviewStatus}</h2>
        </div>
        {application.reviewStatus === '需修改' ? <AlertCircle className="text-amber-300" size={28} /> : <ShieldCheck className="text-emerald-300" size={28} />}
      </div>
      <div className="mt-4 h-2 rounded-full bg-white/15">
        <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm font-semibold">
        已完成 {completedCount} / {totalCount} 项
      </p>
      <p className="mt-2 text-sm leading-6 text-white/70">{statusCopy}</p>
    </section>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="flex items-center gap-3">
      <Link to="/companion/mine" className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100" aria-label="返回">
        <ArrowLeft size={20} />
      </Link>
      <h1 className="text-2xl font-bold">{title}</h1>
    </header>
  );
}

function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function UploadField({
  label,
  value,
  accept,
  multiple,
  onChange,
}: {
  label: string;
  value: string;
  accept: string;
  multiple?: boolean;
  onChange: (files: FileList | null) => void;
}) {
  return (
    <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-zinc-300 bg-white p-4">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 text-zinc-600">
        <Upload size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-zinc-500">{value || '点击上传'}</span>
      </span>
      <input className="hidden" type="file" accept={accept} multiple={multiple} onChange={(event) => onChange(event.target.files)} />
    </label>
  );
}

function ChoiceBlock({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button key={item} onClick={() => onToggle(item)}>
            <Chip active={selected.includes(item)}>{item}</Chip>
          </button>
        ))}
      </div>
    </section>
  );
}

function fileSummary(files: string[]) {
  if (!files.length) return '';
  return files.length === 1 ? files[0] : `${files.length} 个文件：${files.join('、')}`;
}
