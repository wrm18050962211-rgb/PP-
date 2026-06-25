import { ArrowLeft, BadgeCheck, ImagePlus, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { completeRoleRegistration, getRegisteredAccount, logoutAccount } from '../../services/authService';

export function CreatorOnboarding() {
  const navigate = useNavigate();
  const account = getRegisteredAccount();
  const [nickname, setNickname] = useState(account?.creatorName ?? '');
  const [avatarImage, setAvatarImage] = useState(account?.creatorAvatarUrl ?? '');
  const [bio, setBio] = useState('');
  const canSubmit = nickname.trim().length >= 2 && bio.trim().length >= 6;

  async function completeCreatorRegistration() {
    if (!canSubmit) return;
    completeRoleRegistration('consumer', {
      creatorName: nickname.trim(),
      creatorAvatarUrl: avatarImage.trim(),
    });
    await logoutAccount();
    navigate('/auth/login', { replace: true, state: { role: 'consumer', phone: account?.phone } });
  }

  return (
    <div className="min-h-dvh bg-[#f7f7f5] px-4 py-5 text-zinc-950">
      <header className="flex items-center gap-3">
        <Link to="/companion/mine" className="grid h-10 w-10 place-items-center rounded-full bg-white ring-1 ring-zinc-200" aria-label="返回">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <p className="text-xs font-black text-zinc-400">创作者注册</p>
          <h1 className="text-2xl font-black">完善创作者主页</h1>
        </div>
      </header>

      <section className="mt-5 rounded-[10px] bg-zinc-950 p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-white/12 ring-1 ring-white/20">
            {avatarImage ? <img className="h-full w-full object-cover" src={avatarImage} alt={nickname || '创作者头像'} /> : <UserRound size={24} />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black text-white/44">预览主页</p>
            <h2 className="mt-0.5 truncate text-xl font-black">{nickname || '你的创作者昵称'}</h2>
            <p className="mt-1 truncate text-xs font-semibold text-white/54">@{account?.phone ?? '手机号'}</p>
          </div>
        </div>
      </section>

      <section className="mt-5 space-y-3">
        <FormField label="创作者昵称">
          <input className="field" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="例如 Luna Creator" />
        </FormField>

        <FormField label="头像图片地址">
          <input className="field" value={avatarImage} onChange={(event) => setAvatarImage(event.target.value)} placeholder="可先粘贴图片 URL，后续接对象存储上传" />
        </FormField>

        <FormField label="创作简介">
          <textarea
            className="field min-h-28 resize-none rounded-[10px] py-3"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="写清楚你想拍的风格、常去地点、成片用途"
          />
        </FormField>
      </section>

      <section className="mt-5 rounded-[10px] bg-white p-4 ring-1 ring-zinc-200">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-600">
            <ImagePlus size={18} />
          </span>
          <div>
            <p className="text-sm font-black">完成后才开通创作者身份</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">直接返回不会写入身份。提交后会按这里填写的昵称和头像生成你的创作者主页。</p>
          </div>
        </div>
      </section>

      <button
        className={`mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-black text-white ${canSubmit ? 'bg-rose-500' : 'bg-zinc-300'}`}
        disabled={!canSubmit}
        onClick={completeCreatorRegistration}
      >
        <BadgeCheck size={18} />
        完成注册
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
