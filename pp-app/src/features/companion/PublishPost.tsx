import { ArrowLeft, CalendarDays, Check, ImagePlus, MapPin, Send, Sparkles, Type, X } from 'lucide-react';
import { ChangeEvent, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { Chip } from '../../components/Chip';
import { LivePhotoMedia } from '../../components/LivePhotoMedia';
import { uploadPostImage } from '../../services/mediaService';

const styleTags = ['自然光', '松弛感', '小红书', '夜景', '旅行感', '咖啡店', '胶片感', '街拍', '文艺', '甜酷'];
const activityTypes = ['Citywalk 陪拍', '探店吃饭陪拍', '逛街拍照', '夜景散步', '旅行跟拍', '生日纪念'];

export function PublishPost() {
  const { workDraft, saveWorkDraft, submitWork } = useAppData();

  const coverImage = useMemo(
    () => workDraft.images.find((image) => image.id === workDraft.coverImageId) ?? workDraft.images[0],
    [workDraft.coverImageId, workDraft.images],
  );
  const canSubmit =
    workDraft.images.length > 0 &&
    workDraft.location.trim().length > 0 &&
    workDraft.timeLabel.trim().length > 0 &&
    workDraft.caption.trim().length > 0 &&
    workDraft.tags.length > 0 &&
    workDraft.activity.trim().length > 0;

  function toggleTag(tag: string) {
    const tags = workDraft.tags.includes(tag) ? workDraft.tags.filter((item) => item !== tag) : [...workDraft.tags, tag];
    saveWorkDraft({ tags });
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (!files.length) return;

    const nextImages = await Promise.all(files.map(uploadPostImage));
    const images = [...workDraft.images, ...nextImages].map((image, index) => ({ ...image, sortOrder: index + 1 }));
    saveWorkDraft({ images, coverImageId: workDraft.coverImageId || images[0]?.id || '' });
    event.target.value = '';
  }

  function removeImage(imageId: string) {
    const images = workDraft.images.filter((image) => image.id !== imageId).map((image, index) => ({ ...image, sortOrder: index + 1 }));
    saveWorkDraft({
      images,
      coverImageId: workDraft.coverImageId === imageId ? images[0]?.id ?? '' : workDraft.coverImageId,
    });
  }

  return (
    <div className="px-4 py-5 pb-24">
      <header className="flex items-center gap-3">
        <Link to="/companion" className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100" aria-label="返回">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">发布作品</h1>
          <p className="mt-1 text-xs font-medium text-zinc-500">像发 Instagram 帖子一样，把一组照片变成首页入口</p>
        </div>
      </header>

      <section className="mt-5">
        <label className="relative block aspect-[4/5] overflow-hidden rounded-[10px] border border-dashed border-zinc-300 bg-zinc-50">
          {coverImage ? (
            <>
              <LivePhotoMedia media={coverImage} alt="作品封面预览" fit="cover" loading="eager" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
                <p className="text-sm font-black">当前封面</p>
                <p className="mt-1 line-clamp-1 text-xs text-white/78">{workDraft.location || '选择下方图片可切换封面'}</p>
              </div>
            </>
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <ImagePlus className="mx-auto text-zinc-400" size={38} />
                <p className="mt-3 text-sm font-bold">上传一组作品图片</p>
                <p className="mt-1 text-xs text-zinc-500">支持多选，第一张会作为默认封面</p>
              </div>
            </div>
          )}
          <input className="sr-only" type="file" accept="image/*,video/*" multiple onChange={handleFiles} />
        </label>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {workDraft.images.map((image) => (
            <button
              key={image.id}
              className={`relative h-24 w-20 shrink-0 overflow-hidden rounded-[8px] border-2 ${
                image.id === workDraft.coverImageId ? 'border-rose-500' : 'border-transparent'
              }`}
              onClick={() => saveWorkDraft({ coverImageId: image.id })}
              aria-label="选择封面"
            >
              <LivePhotoMedia media={image} alt="" fit="cover" />
              {image.id === workDraft.coverImageId ? (
                <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white">
                  <Check size={13} />
                </span>
              ) : null}
              <span
                className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/58 text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  removeImage(image.id);
                }}
                role="button"
                aria-label="删除图片"
              >
                <X size={14} />
              </span>
            </button>
          ))}
          <label className="grid h-24 w-20 shrink-0 place-items-center rounded-[8px] border border-dashed border-zinc-300 bg-zinc-50 text-zinc-500">
            <ImagePlus size={22} />
            <input className="sr-only" type="file" accept="image/*,video/*" multiple onChange={handleFiles} />
          </label>
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
          <CalendarDays size={18} />
          <input
            className="min-w-0 flex-1 bg-transparent outline-none"
            placeholder="拍摄时间，例如 傍晚 / 春季 / 2026年5月"
            value={workDraft.timeLabel}
            onChange={(event) => saveWorkDraft({ timeLabel: event.target.value })}
          />
        </label>
        <label className="input-line">
          <Type size={18} />
          <textarea
            className="min-h-24 min-w-0 flex-1 resize-none bg-transparent py-2 outline-none"
            placeholder="帖子文字：描述这组照片的情绪、路线和适合人群"
            value={workDraft.caption}
            onChange={(event) => saveWorkDraft({ caption: event.target.value })}
          />
        </label>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
          <Sparkles size={18} />
          风格标签
        </h2>
        <div className="flex flex-wrap gap-2">
          {styleTags.map((tag) => (
            <button key={tag} onClick={() => toggleTag(tag)}>
              <Chip active={workDraft.tags.includes(tag)}>{tag}</Chip>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-bold">活动类型</h2>
        <div className="grid grid-cols-2 gap-2">
          {activityTypes.map((activity) => (
            <button
              key={activity}
              className={`h-11 rounded-full text-sm font-bold ${workDraft.activity === activity ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'}`}
              onClick={() => saveWorkDraft({ activity })}
            >
              {activity}
            </button>
          ))}
        </div>
      </section>

      <section className={`mt-6 rounded-[10px] p-4 text-sm leading-6 ${workDraft.reviewStatus === '已通过' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
        {workDraft.reviewStatus === '已通过'
          ? '作品审核已通过，已进入首页图片流。首页只展示拍摄地点和拍摄时间，文字与陪拍者入口在帖子详情页展示。'
          : workDraft.reviewStatus === '待审核'
            ? '作品已提交审核。运营通过后才会进入首页图片流。'
            : workDraft.reviewStatus === '需修改'
              ? '运营要求修改作品信息后重新提交。'
              : '作品提交后进入审核队列。通过后才会进入首页图片流，平台会检查真实性、盗图风险和地点信息。'}
      </section>

      <button
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-bold text-white disabled:bg-zinc-300"
        onClick={submitWork}
        disabled={!canSubmit || workDraft.reviewStatus === '待审核'}
      >
        <Send size={17} />
        {workDraft.reviewStatus === '待审核' ? '已提交作品审核' : workDraft.reviewStatus === '已通过' ? '重新提交审核' : '提交作品审核'}
      </button>
    </div>
  );
}
