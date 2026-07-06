import { X } from 'lucide-react';
import { useAppData } from '../app/useAppData';

export function OrderActionErrorBanner() {
  const { orderActionError, clearOrderActionError } = useAppData();

  if (!orderActionError) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[80] flex justify-center px-4">
      <div
        className="pointer-events-auto flex w-full max-w-[23rem] items-start gap-3 rounded-[12px] border border-white/12 bg-zinc-950/94 px-4 py-3 text-white shadow-[0_18px_46px_rgba(0,0,0,0.38)] backdrop-blur-xl"
        role="alert"
      >
        <p className="min-w-0 flex-1 text-sm font-bold leading-5">{orderActionError}</p>
        <button
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-white/82 transition hover:bg-white/18 hover:text-white"
          onClick={clearOrderActionError}
          type="button"
          aria-label="关闭提示"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
