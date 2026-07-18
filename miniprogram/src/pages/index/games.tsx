import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cloudCall } from "../../cloud";

type Person = { uid: string; nickname: string; avatar: string; color: string };
type GomokuGame = {
  id: string;
  size: number;
  board: number[];
  blackUid: string;
  whiteUid: string;
  currentTurnUid: string | null;
  winnerUid: string | null;
  status: "active" | "won" | "draw" | "resigned";
  moveCount: number;
  lastMove: { row: number; col: number; uid: string; at: number } | null;
  round: number;
  revision: number;
};

type GameHub = { game: GomokuGame | null; players: Person[]; serverTime: number };

function errorMessage(data: Record<string, unknown>, fallback: string) {
  const message = String(data.error || fallback);
  const diagnostic = String(data.diagnosticId || "");
  return diagnostic ? `${message}（诊断码：${diagnostic}）` : message;
}

export default function GamesPanel({ viewer, partner }: { viewer: Person; partner: Person }) {
  const [hub, setHub] = useState<GameHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const result = await cloudCall("gomoku-hub");
    if (!quiet) setLoading(false);
    if (result.status !== 200) {
      if (!quiet) setError(errorMessage(result.data, "双人游戏暂时没有连接成功。"));
      return;
    }
    setError(null);
    setHub(result.data as unknown as GameHub);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (hub?.game?.status !== "active") return undefined;
    const timer = setInterval(() => { void load(true); }, 5000);
    return () => clearInterval(timer);
  }, [hub?.game?.status, load]);

  const game = hub?.game || null;
  const players = useMemo(() => new Map((hub?.players || [viewer, partner]).map((person) => [person.uid, person])), [hub?.players, partner, viewer]);
  const black = game ? players.get(game.blackUid) || viewer : null;
  const white = game ? players.get(game.whiteUid) || partner : null;
  const myStone = game?.blackUid === viewer.uid ? 1 : 2;
  const myTurn = game?.status === "active" && game.currentTurnUid === viewer.uid;

  const start = async () => {
    setBusy(true);
    const result = await cloudCall("start-gomoku");
    setBusy(false);
    if (result.status < 200 || result.status >= 300) {
      await Taro.showToast({ title: errorMessage(result.data, "开局没有成功，请再试一次。"), icon: "none", duration: 2800 });
      return;
    }
    setHub((current) => current ? { ...current, game: result.data.game as unknown as GomokuGame } : current);
    await Taro.showToast({ title: result.data.resumed ? "继续上一局" : "棋局开始，已通知对方", icon: "none" });
    await load(true);
  };

  const play = async (row: number, col: number) => {
    if (!game || busy || game.status !== "active") return;
    if (!myTurn) {
      await Taro.showToast({ title: `等 ${players.get(game.currentTurnUid || "")?.nickname || "对方"} 落子`, icon: "none" });
      return;
    }
    if (game.board[row * game.size + col]) return;
    setBusy(true);
    const result = await cloudCall("play-gomoku", { row, col, revision: game.revision });
    setBusy(false);
    if (result.status !== 200) {
      await Taro.showToast({ title: errorMessage(result.data, "落子没有成功。"), icon: "none", duration: 2600 });
      await load(true);
      return;
    }
    setHub((current) => current ? { ...current, game: result.data.game as unknown as GomokuGame } : current);
  };

  const resign = async () => {
    const confirmed = await Taro.showModal({
      title: "确认认输这一局？",
      content: "这一局会立即结束，对方获胜。",
      confirmText: "认输",
      confirmColor: "#b32a50",
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    const result = await cloudCall("resign-gomoku");
    setBusy(false);
    if (result.status !== 200) {
      await Taro.showToast({ title: errorMessage(result.data, "操作没有成功。"), icon: "none" });
      return;
    }
    setHub((current) => current ? { ...current, game: result.data.game as unknown as GomokuGame } : current);
  };

  const statusText = !game
    ? "邀请对方来一局，发起者执黑先行"
    : game.status === "active"
      ? myTurn ? "轮到你落子啦" : `等待 ${players.get(game.currentTurnUid || "")?.nickname || "对方"} 落子`
      : game.status === "draw"
        ? "这一局打成平局"
        : game.winnerUid === viewer.uid ? "你赢下了这一局！" : `${players.get(game.winnerUid || "")?.nickname || "对方"} 赢下了这一局`;

  if (loading && !hub) return <View className="together-loading">🎮 正在摆好棋盘…</View>;
  if (error && !hub) return <View className="panel together-error"><Text className="subtitle">游戏屋打了个盹</Text><Text className="description">{error}</Text><Button className="primary" onClick={() => load()}>重新连接</Button></View>;

  return (
    <>
      <View className="page-heading together-heading">
        <Text className="kicker">我们俩的小田地 · 双人游戏</Text>
        <Text className="title">一起玩一局</Text>
        <Text className="description">不用同时在线，落子会自动保存；对方回到小田地就能继续。</Text>
      </View>

      <View className="panel game-lobby-card">
        <View className="game-title-row"><View><Text className="kicker">五子棋 · 第 {game?.round || 1} 局</Text><Text className="subtitle">{statusText}</Text></View><Button className="game-refresh" loading={loading} onClick={() => load()}>↻</Button></View>
        {game && <View className="game-players"><View className={myStone === 1 ? "mine" : ""}><Text className="black-stone" /><Text>{black?.nickname || "黑棋"}</Text></View><Text className="game-versus">VS</Text><View className={myStone === 2 ? "mine" : ""}><Text className="white-stone" /><Text>{white?.nickname || "白棋"}</Text></View></View>}

        {!game
          ? <Button className="primary" loading={busy} onClick={start}>⚫ 发起一局五子棋</Button>
          : <>
            <View className={`gomoku-board ${busy ? "busy" : ""}`}>
              {game.board.map((stone, index) => {
                const row = Math.floor(index / game.size);
                const col = index % game.size;
                const last = game.lastMove?.row === row && game.lastMove?.col === col;
                return <View key={`${row}-${col}`} className={`gomoku-cell ${last ? "last" : ""}`} onClick={() => play(row, col)}>{stone > 0 && <Text className={stone === 1 ? "gomoku-stone black" : "gomoku-stone white"} />}</View>;
              })}
            </View>
            <Text className="game-tip">{game.status === "active" ? `${game.moveCount} 手 · ${myTurn ? "轻点空位落子" : "每 5 秒自动同步"}` : `${game.moveCount} 手结束 · 可以马上再来一局`}</Text>
            <View className="game-actions">
              {game.status === "active" ? <Button className="outline-danger" disabled={busy} onClick={resign}>认输本局</Button> : <Button className="primary" loading={busy} onClick={start}>再来一局</Button>}
              <Button className="secondary" loading={loading} onClick={() => load()}>同步棋盘</Button>
            </View>
          </>}
      </View>

      <View className="village-privacy-note">🎮 棋局只属于绑定的两个人。每一步由云端校验，不能替对方落子；新棋局和轮到对方时会进入消息盒子。</View>
    </>
  );
}
