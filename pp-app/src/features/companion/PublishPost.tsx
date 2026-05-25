import { ArrowLeft, ImagePlus, MapPin, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { Chip } from '../../components/Chip';

const styleTags = ['自然光', '松弛感', '小红书', '夜景', '旅行感', '咖啡店'];

export function PublishPost() {
  const { workDraft, saveWorkDraft, submitWork } = useAppData();

  function toggleTag(tag: string) {
    const tags = workDraft.tags.includes(tag) ? workDraft.tags.filter((item) => item !== tag) : [...workDraft.tags, tag];
    saveWorkDraft({ tags });
  }

  return (
    <div className="px-4 py-5">
      <header className="flex items-center gap-3">
        <Link to="/companion" className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100" aria-label="返回">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">发布作品</h1>
      </header>

      <section className="mt-5 grid aspect-[4/5] place-items-center rounded-[10px] border border-dashed border-zinc-300 bg-zinc-50">
        <div className="text-center">
          <ImagePlus className="mx-auto text-zinc-400" size={36} />
          <p className="mt-3 text-sm font-bold">上传一组作品图片</p>
          <p className="mt-1 text-xs text-zinc-500">MVP 先保留为表单占位，后续接对象存储</p>
        </div>
      </section>

      <section className="mt-5 space-y-3">
        <label className="input-line">
          <MapPin size={18} />
          <input
            className="min-w-0 flex-1 bg-transparent outline-none"
            placeholder="拍摄地点，例如 上海 · 武康路"
            value={workDraft.location}
            onChange={(event) => saveWorkDraft({ location: event.target.value })}
          />
        </label>
        <label className="input-line">
          <Sparkles size={18} />
          <input
            className="min-w-0 flex-1 bg-transparent outline-none"
            placeholder="拍摄时间，例如 傍晚 / 春季 / 2026年5月"
            value={workDraft.timeLabel}
            onChange={(event) => saveWorkDraft({ timeLabel: event.target.value })}
          />
        </label>
        <textarea
          className="field min-h-28 resize-none py-3"
          placeholder="帖子文字：描述这组照片的情绪、路线和适合人群"
          value={workDraft.caption}
          onChange={(event) => saveWorkDraft({ caption: event.target.value })}
        />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-bold">风格标签</h2>
        <div className="flex flex-wrap gap-2">
          {styleTags.map((tag) => (
            <button key={tag} onClick={() => toggleTag(tag)}>
              <Chip active={workDraft.tags.includes(tag)}>{tag}</Chip>
            </button>
          ))}
        </div>
      </section>

      <section className={`mt-6 rounded-[10px] p-4 text-sm leading-6 ${workDraft.submitted ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
        {workDraft.reviewStatus === '已通过'
          ? '作品审核已通过，可以进入首页图片流。'
          : workDraft.reviewStatus === '待审核'
            ? '作品已提交审核。运营通过后才会进入首页图片流。'
            : workDraft.reviewStatus === '需修改'
              ? '运营要求修改作品信息后重新提交。'
              : '作品提交后进入审核队列。通过后才会进入首页图片流，平台会检查真实性、盗图风险和地点信息。'}
      </section>

      <button className="mt-6 h-12 w-full rounded-full bg-zinc-950 text-sm font-bold text-white" onClick={submitWork}>
        {workDraft.reviewStatus === '待审核' ? '已提交作品审核' : workDraft.reviewStatus === '已通过' ? '审核已通过' : '提交作品审核'}
      </button>
    </div>
  );
}
