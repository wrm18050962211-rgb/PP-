import { ArrowLeft, Camera, Heart, MapPin, MessageCircle } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { buildCreator } from './PostDetail';
import { listFeedPosts } from '../../services/feedService';

export function CreatorProfilePage() {
  const { creatorId } = useParams();
  const navigate = useNavigate();
  const posts = listFeedPosts();
  const ownedPosts = posts.filter((post) => buildCreator(post).id === creatorId);
  const profilePost = ownedPosts[0] || posts[0];
  const creator = buildCreator(profilePost);
  const works = ownedPosts.length ? ownedPosts : posts.slice(0, 6);
  const photographers = Array.from(new Map(works.map((post) => [post.companion.id, post.companion])).values());

  return (
    <div className="min-h-dvh bg-[#fbf7f2] pb-24 text-[#3f302c]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#eadfd8]/80 bg-[#fbf7f2]/94 px-4 py-3 backdrop-blur-xl">
        <button className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#3f302c] ring-1 ring-[#eadfd8]" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
        <p className="text-sm font-black">创作者主页</p>
        <Link to="/consumer/messages" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#3f302c] ring-1 ring-[#eadfd8]" aria-label="私信">
          <MessageCircle size={18} />
        </Link>
      </header>

      <section className="px-4 pt-4">
        <div className="rounded-[22px] bg-white p-4 ring-1 ring-[#eadfd8]">
          <div className="flex gap-4">
            <img className="h-24 w-24 rounded-[22px] object-cover" src={creator.avatar} alt={creator.name} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-black">{creator.name}</h1>
              <p className="mt-2 flex items-center gap-1 text-sm font-bold text-[#7a6b64]">
                <MapPin size={15} className="text-[#e85d75]" />
                {creator.meta}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black">
                <span className="rounded-[12px] bg-[#f6eee8] px-2 py-2">{works.length} 作品</span>
                <span className="rounded-[12px] bg-[#f6eee8] px-2 py-2">{photographers.length} 摄影师</span>
                <span className="rounded-[12px] bg-[#f6eee8] px-2 py-2">可带单</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#3f302c] text-sm font-black text-white">
              <Heart size={17} />
              关注TA
            </button>
            <Link className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#f6eee8] text-sm font-black text-[#3f302c]" to={`/consumer/companions?sameStyle=${profilePost.id}`}>
              <Camera size={17} />
              拍同款
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 pt-4">
        <h2 className="mb-3 text-base font-black">作品</h2>
        <div className="grid grid-cols-3 gap-2">
          {works.map((post) => (
            <Link key={post.id} to={`/consumer/post/${post.id}`} className="aspect-[0.76] overflow-hidden rounded-[14px] bg-[#eadfd8]">
              <img className="h-full w-full object-cover" src={post.images[0]?.url} alt={post.location} />
            </Link>
          ))}
        </div>
      </section>

      <section className="px-4 pt-5">
        <h2 className="mb-3 text-base font-black">合作摄影师</h2>
        <div className="space-y-2">
          {photographers.map((photographer) => (
            <Link key={photographer.id} to={`/consumer/photographer/${photographer.id}`} className="flex items-center gap-3 rounded-[16px] bg-white p-3 ring-1 ring-[#eadfd8]">
              <img className="h-12 w-12 rounded-[14px] object-cover" src={photographer.avatar} alt={photographer.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{photographer.name}</p>
                <p className="truncate text-xs font-bold text-[#7a6b64]">{photographer.tags.slice(0, 2).join(' / ')}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
