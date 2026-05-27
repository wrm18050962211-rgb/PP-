import { ArrowLeft, Camera, Check, ImagePlus, PlayCircle, Save, Sparkles, Upload, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { Chip } from '../../components/Chip';

const genderOptions = ['女', '男', '不展示'];
const ageRanges = ['18-22', '23-26', '27-30', '31+'];
const personalityTags = ['轻松聊天', '温柔耐心', '活泼开朗', '安静陪伴', '不尴尬', '适合第一次拍照'];
const styleTags = ['松弛感', '自然光', '小红书', '探店日常', '旅行感', '夜景氛围', '甜酷风', '法式街拍'];
const interactionTags = ['会指导动作', '懂女生拍照需求', '会找机位', '会帮忙看穿搭', '会看光线', '会带动情绪'];

export function CompanionProfileEdit() {
  const { application, saveApplication } = useAppData();
  const [toast, setToast] = useState('');
  const selectedPersonalityTags = application.tags;
  const selectedStyleTags = application.styleTags ?? [];
  const selectedInteractionTags = application.interactionTags ?? [];

  function toggleList(field: 'tags' | 'styleTags' | 'interactionTags', item: string) {
    const current = application[field] ?? [];
    const next = current.includes(item) ? current.filter((value) => value !== item) : [...current, item];
    saveApplication({ [field]: next });
  }

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') saveApplication({ avatarImage: reader.result });
    };
    reader.readAsDataURL(file);
  }

  function handleIntroVideoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') saveApplication({ introVideo: reader.result, showIntroVideo: true });
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    saveApplication({ updatedAt: new Date().toISOString() });
    setToast('资料已保存');
    window.setTimeout(() => setToast(''), 1500);
  }

  const profileCompleteness = [
    application.nickname.trim(),
    application.avatarImage,
    application.gender,
    application.ageRange,
    application.bio.trim(),
    selectedPersonalityTags.length,
    selectedStyleTags.length,
    selectedInteractionTags.length,
  ].filter(Boolean).length;

  return (
    <div className="pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-100 bg-white/95 px-4 py-4 backdrop-blur">
        <Link to="/companion" className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100" aria-label="返回">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">资料编辑</h1>
          <p className="mt-0.5 text-xs text-zinc-500">让用户先感受到你真实、好相处、会照顾情绪</p>
        </div>
      </header>

      <main className="px-4 py-5">
        <section className="rounded-[10px] bg-zinc-950 p-4 text-white">
          <div className="flex items-start gap-3">
            <div className="h-20 w-20 overflow-hidden rounded-[10px] bg-zinc-800">
              {application.avatarImage ? (
                <img src={application.avatarImage} alt="真人照片预览" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center">
                  <UserRound className="text-white/45" size={30} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-lg font-bold">{application.nickname || '你的昵称'}</p>
                {application.avatarImage && <Check className="text-emerald-300" size={17} />}
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-white/70">
                {application.bio || '一句轻松自然的介绍，会让第一次下单的人更安心。'}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...selectedPersonalityTags, ...selectedInteractionTags].slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full bg-white/12 px-2 py-1 text-[11px] font-medium text-white/85">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-white/15">
            <div className="h-1.5 rounded-full bg-rose-400" style={{ width: `${Math.round((profileCompleteness / 8) * 100)}%` }} />
          </div>
        </section>

        <FormSection title="基础资料">
          <label className="input-line">
            <UserRound size={18} />
            <input
              className="min-w-0 flex-1 bg-transparent outline-none"
              placeholder="昵称，例如 Mori"
              value={application.nickname}
              onChange={(event) => saveApplication({ nickname: event.target.value })}
            />
          </label>

          <div className="rounded-[10px] border border-dashed border-zinc-300 bg-zinc-50 p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-white">
                <Camera size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">真人照片</p>
                <p className="mt-0.5 text-xs text-zinc-500">建议用清晰正脸或生活照，提升信任感</p>
              </div>
              <label className="grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-zinc-950 text-white" title="上传照片">
                <ImagePlus size={18} />
                <input className="hidden" type="file" accept="image/*" onChange={handlePhotoChange} />
              </label>
            </div>
            <input
              className="field mt-3 bg-white"
              placeholder="也可以粘贴图片链接"
              value={application.avatarImage}
              onChange={(event) => saveApplication({ avatarImage: event.target.value })}
            />
          </div>

          <SegmentedControl label="性别" options={genderOptions} value={application.gender} onChange={(gender) => saveApplication({ gender })} />
          <SegmentedControl label="年龄段" options={ageRanges} value={application.ageRange} onChange={(ageRange) => saveApplication({ ageRange })} />

          <textarea
            className="field min-h-28 resize-none rounded-[10px] py-3 leading-6"
            placeholder="简短介绍：比如“我会先陪你聊一会儿，再慢慢找光线和角度，不会让你尴尬。”"
            value={application.bio}
            onChange={(event) => saveApplication({ bio: event.target.value })}
          />
        </FormSection>

        <TagSection title="性格标签" desc="让用户知道跟你相处是什么感觉" items={personalityTags} selected={selectedPersonalityTags} onToggle={(item) => toggleList('tags', item)} />
        <TagSection title="擅长风格" desc="帮助用户判断你能不能拍出 TA 想要的感觉" items={styleTags} selected={selectedStyleTags} onToggle={(item) => toggleList('styleTags', item)} />
        <TagSection title="互动方式" desc="强调你能提供的情绪价值和现场支持" items={interactionTags} selected={selectedInteractionTags} onToggle={(item) => toggleList('interactionTags', item)} />

        <section className="mt-6 rounded-[10px] border border-zinc-200 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-600">
              <PlayCircle size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">自我介绍视频</h2>
              <p className="mt-0.5 text-xs text-zinc-500">给消费者展示你的强项、设备和相处方式</p>
            </div>
            <button
              className={`h-7 w-12 rounded-full p-1 transition ${application.showIntroVideo ? 'bg-rose-500' : 'bg-zinc-200'}`}
              onClick={() => saveApplication({ showIntroVideo: !application.showIntroVideo })}
              aria-label="切换是否展示自我介绍视频"
            >
              <span className={`block h-5 w-5 rounded-full bg-white transition ${application.showIntroVideo ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          {application.showIntroVideo && (
            <div className="mt-4 space-y-3">
              {application.introVideo ? (
                <video className="aspect-video w-full rounded-[10px] bg-zinc-950 object-cover" src={application.introVideo} controls />
              ) : (
                <div className="grid aspect-video place-items-center rounded-[10px] bg-zinc-100 text-zinc-400">
                  <PlayCircle size={34} />
                </div>
              )}

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  className="field"
                  placeholder="自我介绍视频链接"
                  value={application.introVideo}
                  onChange={(event) => saveApplication({ introVideo: event.target.value })}
                />
                <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-zinc-950 text-white" title="上传视频">
                  <Upload size={18} />
                  <input className="hidden" type="file" accept="video/*" onChange={handleIntroVideoChange} />
                </label>
              </div>

              <textarea
                className="field min-h-24 resize-none rounded-[10px] py-3 leading-6"
                placeholder="视频介绍文案：介绍你是谁、擅长什么、怎么帮用户放松下来"
                value={application.introVideoText}
                onChange={(event) => saveApplication({ introVideoText: event.target.value })}
              />

              <input
                className="field"
                placeholder="强项，例如 第一次拍照不尴尬、自然抓拍、会指导动作"
                value={application.strengths}
                onChange={(event) => saveApplication({ strengths: event.target.value })}
              />

              <input
                className="field"
                placeholder="设备，例如 iPhone 15 Pro、Sony A7C、补光灯"
                value={application.equipment}
                onChange={(event) => saveApplication({ equipment: event.target.value })}
              />
            </div>
          )}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur">
        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-500 text-sm font-bold text-white"
          onClick={handleSave}
        >
          <Save size={18} />
          保存资料
        </button>
      </div>
      {toast ? <div className="fixed left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-white shadow-xl">{toast}</div> : null}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SegmentedControl({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option}
            className={`h-11 rounded-full text-sm font-bold ${value === option ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'}`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagSection({
  title,
  desc,
  items,
  selected,
  onToggle,
}: {
  title: string;
  desc: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-start gap-2">
        <Sparkles className="mt-0.5 text-rose-500" size={18} />
        <div>
          <h2 className="text-base font-bold">{title}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{desc}</p>
        </div>
      </div>
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
