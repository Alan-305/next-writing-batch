"use client";

type Props = {
  /** ボタン内などで並べるときの基準 */
  className?: string;
};

/**
 * 取り込み処理中などに使う「目玉がくるりと回る」ローディング表示。
 */
export function ProcessingEyesIcon({ className }: Props) {
  return (
    <span className={className ? `processing-eyes-icon ${className}` : "processing-eyes-icon"} aria-hidden>
      <span className="processing-eyes-eye">
        <span className="processing-eyes-pupil" />
      </span>
      <span className="processing-eyes-eye">
        <span className="processing-eyes-pupil processing-eyes-pupil--lag" />
      </span>
    </span>
  );
}
