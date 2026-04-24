/**
 * Next サーバー起動時にも実行され、ワーカーなど layout より前に動く場合がある。
 * fix モジュールは冪等。
 */
import "@/lib/fix-node-localstorage";

export async function register() {}
