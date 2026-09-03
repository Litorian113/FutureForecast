export function Loader({ text }: { text?: string }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="circle" />
      <div className="circle" />
      <div className="circle" />
      <div className="circle" />
      <div className="circle" />
      {text && <div className="loaderText">{text}</div>}
    </div>
  );
}
