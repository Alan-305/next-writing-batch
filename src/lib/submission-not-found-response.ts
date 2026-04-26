/**
 * `data/submissions.json` に提出が無いときの API 本文。
 * 複数コンテナでローカル JSON が分かれていると、一覧は見えても PATCH が 404 になることがある。
 */
export type SubmissionNotFoundBody = {
  ok: false;
  code: "SUBMISSION_NOT_FOUND";
  message: string;
};

export function submissionNotFoundBody(): SubmissionNotFoundBody {
  return {
    ok: false,
    code: "SUBMISSION_NOT_FOUND",
    message:
      "提出が見つかりません。受付IDの誤り・別URLの環境のほか、本番を複数コンテナ／サーバーで動かしていると各インスタンスの data/submissions.json が別になり、このエラーになることがあります。data/ を共有するかレプリカを1台にするか、永続ストレージ／DB へ移行してください。詳細は docs/DEPLOYMENT.md を参照してください。",
  };
}
