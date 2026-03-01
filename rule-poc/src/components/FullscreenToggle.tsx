import React, { useEffect, useMemo, useState } from "react";

type Props = {
  /** フルスクリーン対象（指定がなければ document.documentElement） */
  targetId?: string;
};

export default function FullscreenToggle({ targetId }: Props) {
  const [isFs, setIsFs] = useState<boolean>(!!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const targetEl = useMemo(() => {
    if (!targetId) return document.documentElement;
    return document.getElementById(targetId) ?? document.documentElement;
  }, [targetId]);

  async function toggle() {
    try {
      if (!document.fullscreenElement) {
        await (targetEl as any).requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // Fullscreen が許可されない（iframe埋め込み等）場合がある
      // その場合は別タブで開く導線を用意する
      window.open(window.location.href, "_blank", "noopener,noreferrer");
    }
  }

  function openNewTab() {
    window.open(window.location.href, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button
        onClick={toggle}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(255,255,255,0.06)",
          color: "inherit",
          cursor: "pointer",
        }}
        title="可能ならブラウザ全画面化。埋め込みで不可なら新しいタブで開きます。"
      >
        {isFs ? "全画面を終了" : "全画面"}
      </button>

      <button
        onClick={openNewTab}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(255,255,255,0.06)",
          color: "inherit",
          cursor: "pointer",
        }}
        title="新しいタブで開きます（Google Sites埋め込みでも確実）"
      >
        別タブで開く
      </button>
    </div>
  );
}
