import { ArrowLeft, ImagePlus, Save, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchAuthSession } from '../../services/authService';
import { createDefaultCreatorProfile, getCreatorIdentity, readCreatorProfile, saveCreatorProfile, type CreatorProfileDraft } from '../../services/creatorProfileService';
import { listFeedPosts } from '../../services/feedService';
import type { AuthSession } from '../../types/api';

export function CreatorProfileEditPage() {
  const navigate = useNavigate();
  const posts = useMemo(() => listFeedPosts(), []);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [draft, setDraft] = useState<CreatorProfileDraft>(() => {
    const post = posts[0];
    return readCreatorProfile('consumer') ?? createDefaultCreatorProfile(null, post);
  });

  useEffect(() => {
    let mounted = true;
    fetchAuthSession().then((nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      const profilePost = posts.find((post) => getCreatorIdentity(post).id === nextSession.user.id) ?? posts[0];
      setDraft(readCreatorProfile('consumer') ?? createDefaultCreatorProfile(nextSession, profilePost));
    });
    return () => {
      mounted = false;
    };
  }, [posts]);

  const canSave = draft.displayName.trim().length >= 2 && draft.bio.trim().length >= 6;

  async function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    const dataUrl = await readFileAsDataUrl(file);
    setDraft((current) => ({ ...current, avatarUrl: dataUrl }));
  }

  function save() {
    if (!canSave) return;
    saveCreatorProfile({
      ...draft,
      creatorId: session?.user.id || draft.creatorId,
      displayName: draft.displayName.trim(),
      bio: draft.bio.trim(),
    }, 'consumer');
    navigate('/consumer/mine');
  }

  return (
    <div className="min-h-dvh bg-[#f7f7f5] px-4 py-5 text-zinc-950">
      <header className="flex items-center gap-3">
        <Link to="/consumer/mine" className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-zinc-200" aria-label="返回">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <p className="text-xs font-black text-rose-500">创作者主页</p>
          <h1 className="text-2xl font-black">编辑主页</h1>
        </div>
      </header>

      <section className="mt-5 rounded-[12px] bg-zinc-950 p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-white/12 ring-1 ring-white/20">
            {draft.avatarUrl ? <img className="h-full w-full object-cover" src={draft.avatarUrl} alt={draft.displayName} /> : <UserRound size={26} />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black text-white/44">预览</p>
            <h2 className="mt-0.5 truncate text-xl font-black">{draft.displayName || '你的创作者名称'}</h2>
            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-white/58">{draft.bio || '写一段主页简介，让摄影师和其他用户了解你的风格。'}</p>
          </div>
        </div>
      </section>

      <section className="mt-5 space-y-4">
        <FormField label="头像">
          <div className="grid gap-2">
            <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-black text-white">
              <ImagePlus size={17} />
              选择本地图片
              <input className="hidden" type="file" accept="image/*" onChange={(event) => void handleFile(event.target.files?.[0])} />
            </label>
            <input
              className="field"
              value={draft.avatarUrl}
              onChange={(event) => setDraft((current) => ({ ...current, avatarUrl: event.target.value }))}
              placeholder="也可以粘贴头像图片 URL"
            />
          </div>
        </FormField>

        <FormField label="ID 名称">
          <input
            className="field"
            value={draft.displayName}
            onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
            placeholder="例如 Creator 1"
          />
        </FormField>

        <FormField label="文字简介">
          <textarea
            className="field min-h-32 resize-none rounded-[10px] py-3"
            value={draft.bio}
            onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
            placeholder="写清楚你的常拍地点、喜欢的风格、成片用途或希望合作的摄影师类型"
          />
        </FormField>
      </section>

      <button
        className={`mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-black text-white ${canSave ? 'bg-rose-500' : 'bg-zinc-300'}`}
        disabled={!canSave}
        onClick={save}
        type="button"
      >
        <Save size={18} />
        保存主页
      </button>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black">{label}</span>
      {children}
    </label>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
