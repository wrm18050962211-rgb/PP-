import brandIconUrl from '../../../brand/still-app-icon-1024.png';

export function ConsumerAuthBrand() {
  return (
    <header className="flex flex-col items-center text-center">
      <img
        className="h-[72px] w-[72px] rounded-[16px]"
        src={brandIconUrl}
        alt=""
        draggable={false}
      />
      <h1 className="mt-4 text-[2rem] font-black tracking-[-0.045em] text-white">帧遇</h1>
      <p className="mt-2 text-sm font-semibold text-white/58">留住此刻的样子</p>
    </header>
  );
}
