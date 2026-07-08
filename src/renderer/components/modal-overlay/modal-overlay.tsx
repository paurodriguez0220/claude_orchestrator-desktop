export interface ModalOverlayProps {
  children: React.ReactNode;
}

export function ModalOverlay({ children }: ModalOverlayProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-950/80 p-4">
      <div className="w-full max-w-md rounded-lg border border-graphite-700 bg-graphite-800 p-6 text-graphite-100 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
