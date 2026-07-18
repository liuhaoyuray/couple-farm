import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloudCall, type CloudResult } from "../../cloud";

type Person = { uid: string; nickname: string; avatar: string; color: string };
type GameStatus = "active" | "won" | "draw" | "resigned";
type GomokuGame = {
  id: string; size: number; board: number[]; blackUid: string; whiteUid: string;
  currentTurnUid: string | null; winnerUid: string | null; status: GameStatus;
  moveCount: number; lastMove: { row: number; col: number; uid: string; at: number } | null;
  round: number; revision: number;
};
type TicTacToeGame = {
  id: string; size: number; board: number[]; xUid: string; oUid: string;
  currentTurnUid: string | null; winnerUid: string | null; status: GameStatus;
  moveCount: number; lastMove: { position: number; uid: string; at: number } | null;
  round: number; revision: number;
};
type RpsChoice = "rock" | "paper" | "scissors";
type RpsGame = {
  id: string; playerOneUid: string; playerTwoUid: string; status: "active" | "complete";
  myChoice: RpsChoice | null; partnerReady: boolean; revealed: boolean;
  choices: Record<string, RpsChoice>; winnerUid: string | null; round: number; revision: number;
};
type GamesHub = {
  games: { gomoku: GomokuGame | null; ticTacToe: TicTacToeGame | null; rps: RpsGame | null };
  players: Person[];
  serverTime: number;
};
type GameKey = keyof GamesHub["games"];
type GameFailure = { message: string; code: string };

const gameMeta: Record<GameKey, { icon: string; name: string; summary: string }> = {
  gomoku: { icon: "⚫", name: "五子棋", summary: "经典 15×15" },
  ticTacToe: { icon: "❎", name: "井字棋", summary: "三格连线" },
  rps: { icon: "✊", name: "默契猜拳", summary: "同时揭晓" },
};
const rpsMeta: Record<RpsChoice, { icon: string; label: string }> = {
  rock: { icon: "✊", label: "石头" },
  scissors: { icon: "✌️", label: "剪刀" },
  paper: { icon: "🖐️", label: "布" },
};

function failureFrom(result: CloudResult, fallback: string): GameFailure {
  return {
    message: String(result.data.error || fallback),
    code: String(result.data.diagnosticId || result.data.code || `HTTP_${result.status}`),
  };
}

function actionId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function GamesPanel({ viewer, partner }: { viewer: Person; partner: Person }) {
  const [hub, setHub] = useState<GamesHub | null>(null);
  const [activeGame, setActiveGame] = useState<GameKey>("gomoku");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<GameFailure | null>(null);
  const [actionError, setActionError] = useState<GameFailure | null>(null);
  const [connectionSlow, setConnectionSlow] = useState(false);
  const loadInFlight = useRef<Promise<void> | null>(null);
  const mutationInFlight = useRef(false);

  const load = useCallback((quiet = false) => {
    if (loadInFlight.current) return loadInFlight.current;
    const request = (async () => {
      if (!quiet) setLoading(true);
      const result = await cloudCall("games-hub", {}, { timeoutMs: 8000, retries: 1 });
      if (!quiet) setLoading(false);
      if (result.status !== 200) {
        const failure = failureFrom(result, "双人游戏暂时没有连接成功。");
        if (quiet) setConnectionSlow(true);
        else setPageError(failure);
        return;
      }
      setPageError(null);
      setConnectionSlow(false);
      setHub(result.data as unknown as GamesHub);
    })().finally(() => {
      loadInFlight.current = null;
    });
    loadInFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedGame = hub?.games[activeGame] || null;
  const waitingForPartner = activeGame === "rps"
    ? Boolean(hub?.games.rps?.status === "active" && hub.games.rps.myChoice && !hub.games.rps.partnerReady)
    : Boolean(selectedGame && "currentTurnUid" in selectedGame && selectedGame.status === "active" && selectedGame.currentTurnUid !== viewer.uid);

  useEffect(() => {
    if (!hub || busy || !selectedGame) return undefined;
    const active = selectedGame.status === "active";
    if (!active) return undefined;
    const delay = waitingForPartner ? 2800 : 10000;
    const timer = setInterval(() => { void load(true); }, delay);
    return () => clearInterval(timer);
  }, [busy, hub, load, selectedGame, waitingForPartner]);

  const players = useMemo(
    () => new Map((hub?.players || [viewer, partner]).map((person) => [person.uid, person])),
    [hub?.players, partner, viewer],
  );

  const replaceGame = useCallback(<Key extends GameKey>(key: Key, game: GamesHub["games"][Key]) => {
    setHub((current) => current ? { ...current, games: { ...current.games, [key]: game } } : current);
  }, []);

  const finishMutation = () => {
    mutationInFlight.current = false;
    setBusy(false);
  };

  const start = async (key: GameKey) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setActionError(null);
    const action = key === "gomoku" ? "start-gomoku" : key === "ticTacToe" ? "start-tic-tac-toe" : "start-rps";
    const result = await cloudCall(action, {}, { timeoutMs: 9000, retries: 1 });
    finishMutation();
    if (result.status < 200 || result.status >= 300) {
      setActionError(failureFrom(result, "开局没有成功，请再试一次。"));
      return;
    }
    replaceGame(key, result.data.game as never);
    await Taro.showToast({ title: result.data.resumed ? "继续上一局" : "开局成功", icon: "none" });
  };

  const playGomoku = async (row: number, col: number) => {
    const game = hub?.games.gomoku;
    if (!game || mutationInFlight.current || game.status !== "active") return;
    if (game.currentTurnUid !== viewer.uid) {
      await Taro.showToast({ title: `等 ${players.get(game.currentTurnUid || "")?.nickname || "对方"} 落子`, icon: "none" });
      return;
    }
    const index = row * game.size + col;
    if (game.board[index]) return;
    mutationInFlight.current = true;
    setBusy(true);
    setActionError(null);
    const clientMoveId = actionId("gomoku");
    const optimisticBoard = [...game.board];
    optimisticBoard[index] = game.blackUid === viewer.uid ? 1 : 2;
    replaceGame("gomoku", {
      ...game,
      board: optimisticBoard,
      moveCount: game.moveCount + 1,
      currentTurnUid: partner.uid,
      lastMove: { row, col, uid: viewer.uid, at: Number(hub.serverTime) || 0 },
    });
    const result = await cloudCall("play-gomoku", {
      row, col, revision: game.revision, clientMoveId,
    }, { timeoutMs: 8500, retries: 1 });
    finishMutation();
    if (result.status !== 200) {
      setActionError(failureFrom(result, "这一步没有同步成功。"));
      await load(true);
      return;
    }
    replaceGame("gomoku", result.data.game as unknown as GomokuGame);
  };

  const playTicTacToe = async (position: number) => {
    const game = hub?.games.ticTacToe;
    if (!game || mutationInFlight.current || game.status !== "active") return;
    if (game.currentTurnUid !== viewer.uid) {
      await Taro.showToast({ title: `等 ${players.get(game.currentTurnUid || "")?.nickname || "对方"} 落子`, icon: "none" });
      return;
    }
    if (game.board[position]) return;
    mutationInFlight.current = true;
    setBusy(true);
    setActionError(null);
    const clientMoveId = actionId("tic");
    const optimisticBoard = [...game.board];
    optimisticBoard[position] = game.xUid === viewer.uid ? 1 : 2;
    replaceGame("ticTacToe", {
      ...game,
      board: optimisticBoard,
      moveCount: game.moveCount + 1,
      currentTurnUid: partner.uid,
      lastMove: { position, uid: viewer.uid, at: Number(hub.serverTime) || 0 },
    });
    const result = await cloudCall("play-tic-tac-toe", {
      position, revision: game.revision, clientMoveId,
    }, { timeoutMs: 8500, retries: 1 });
    finishMutation();
    if (result.status !== 200) {
      setActionError(failureFrom(result, "这个格子没有同步成功。"));
      await load(true);
      return;
    }
    replaceGame("ticTacToe", result.data.game as unknown as TicTacToeGame);
  };

  const chooseRps = async (choice: RpsChoice) => {
    const game = hub?.games.rps;
    if (!game || mutationInFlight.current || game.status !== "active" || game.myChoice) return;
    mutationInFlight.current = true;
    setBusy(true);
    setActionError(null);
    const clientActionId = actionId("rps");
    replaceGame("rps", { ...game, myChoice: choice });
    const result = await cloudCall("choose-rps", { choice, clientActionId }, { timeoutMs: 8500, retries: 1 });
    finishMutation();
    if (result.status !== 200) {
      setActionError(failureFrom(result, "出拳没有同步成功。"));
      await load(true);
      return;
    }
    replaceGame("rps", result.data.game as unknown as RpsGame);
  };

  const resign = async (key: "gomoku" | "ticTacToe") => {
    const confirmed = await Taro.showModal({
      title: "确认认输这一局？",
      content: "这一局会立即结束，对方获胜。",
      confirmText: "认输",
      confirmColor: "#b32a50",
    });
    if (!confirmed.confirm || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    const result = await cloudCall(key === "gomoku" ? "resign-gomoku" : "resign-tic-tac-toe", {}, { timeoutMs: 8500, retries: 1 });
    finishMutation();
    if (result.status !== 200) {
      setActionError(failureFrom(result, "认输操作没有同步成功。"));
      return;
    }
    replaceGame(key, result.data.game as never);
  };

  const copyDiagnostic = async (failure: GameFailure) => {
    await Taro.setClipboardData({ data: failure.code });
  };

  if (loading && !hub) return <View className="together-loading">🎮 正在打开游戏屋…</View>;
  if (pageError && !hub) return <View className="panel together-error"><Text className="subtitle">游戏屋暂时没有连好</Text><Text className="description">{pageError.message}</Text><Text className="game-diagnostic">诊断码：{pageError.code}</Text><View className="game-error-actions"><Button onClick={() => copyDiagnostic(pageError)}>复制诊断码</Button><Button className="primary" onClick={() => load()}>重新连接</Button></View></View>;

  const gomoku = hub?.games.gomoku || null;
  const ticTacToe = hub?.games.ticTacToe || null;
  const rps = hub?.games.rps || null;

  const turnText = (game: GomokuGame | TicTacToeGame | null) => !game
    ? "还没有开局"
    : game.status === "active"
      ? game.currentTurnUid === viewer.uid ? "轮到你啦" : `等待 ${players.get(game.currentTurnUid || "")?.nickname || "对方"}`
      : game.status === "draw" ? "这一局打平啦" : game.winnerUid === viewer.uid ? "你赢下了这一局！" : `${players.get(game.winnerUid || "")?.nickname || "对方"} 赢啦`;

  return (
    <>
      <View className="page-heading together-heading">
        <Text className="kicker">我们俩的小田地 · 游戏屋</Text>
        <Text className="title">挑一个，马上开玩</Text>
        <Text className="description">落子先在手机上显示，再由云端确认；对方不在线也能稍后继续。</Text>
      </View>

      <View className="game-selector">
        {(Object.keys(gameMeta) as GameKey[]).map((key) => <Button key={key} className={activeGame === key ? "game-selector-card active" : "game-selector-card"} onClick={() => { setActiveGame(key); setActionError(null); }}><Text className="game-selector-icon">{gameMeta[key].icon}</Text><Text>{gameMeta[key].name}</Text><Text className="role">{gameMeta[key].summary}</Text></Button>)}
      </View>

      {(connectionSlow || actionError) && <View className={actionError ? "game-sync-banner error" : "game-sync-banner"}><View><Text className="activity-title">{actionError ? "这一步还没同步好" : "正在重新连接云端"}</Text><Text className="role">{actionError?.message || "当前棋盘仍可查看，稍后会自动再试。"}</Text>{actionError && <Text className="game-diagnostic">诊断码：{actionError.code}</Text>}</View><View className="game-banner-actions">{actionError && <Button onClick={() => copyDiagnostic(actionError)}>复制</Button>}<Button onClick={() => { setActionError(null); void load(); }}>同步</Button></View></View>}

      {activeGame === "gomoku" && <View className="panel game-lobby-card">
        <View className="game-title-row"><View><Text className="kicker">五子棋 · 第 {gomoku?.round || 1} 局</Text><Text className="subtitle">{turnText(gomoku)}</Text></View><Button className="game-refresh" loading={loading} onClick={() => load()}>↻</Button></View>
        {gomoku && <View className="game-players"><View className={gomoku.blackUid === viewer.uid ? "mine" : ""}><Text className="black-stone" /><Text>{players.get(gomoku.blackUid)?.nickname || "黑棋"}</Text></View><Text className="game-versus">VS</Text><View className={gomoku.whiteUid === viewer.uid ? "mine" : ""}><Text className="white-stone" /><Text>{players.get(gomoku.whiteUid)?.nickname || "白棋"}</Text></View></View>}
        {!gomoku ? <Button className="primary" loading={busy} onClick={() => start("gomoku")}>⚫ 发起一局五子棋</Button> : <>
          <View className={`gomoku-board ${busy ? "busy" : ""}`}>{gomoku.board.map((stone, index) => { const row = Math.floor(index / gomoku.size); const col = index % gomoku.size; const last = gomoku.lastMove?.row === row && gomoku.lastMove?.col === col; return <View key={`${row}-${col}`} className={`gomoku-cell ${last ? "last" : ""}`} onClick={() => playGomoku(row, col)}>{stone > 0 && <Text className={stone === 1 ? "gomoku-stone black" : "gomoku-stone white"} />}</View>; })}</View>
          <Text className="game-tip">{busy ? "正在云端确认这一步…" : gomoku.status === "active" ? `${gomoku.moveCount} 手 · ${gomoku.currentTurnUid === viewer.uid ? "轻点空位落子" : "等待时约 3 秒同步"}` : `${gomoku.moveCount} 手结束`}</Text>
          <View className="game-actions">{gomoku.status === "active" ? <Button className="outline-danger" disabled={busy} onClick={() => resign("gomoku")}>认输本局</Button> : <Button className="primary" loading={busy} onClick={() => start("gomoku")}>再来一局</Button>}<Button className="secondary" loading={loading} onClick={() => load()}>同步棋盘</Button></View>
        </>}
      </View>}

      {activeGame === "ticTacToe" && <View className="panel game-lobby-card tic-card">
        <View className="game-title-row"><View><Text className="kicker">井字棋 · 第 {ticTacToe?.round || 1} 局</Text><Text className="subtitle">{turnText(ticTacToe)}</Text></View><Button className="game-refresh" loading={loading} onClick={() => load()}>↻</Button></View>
        {!ticTacToe ? <Button className="primary" loading={busy} onClick={() => start("ticTacToe")}>❎ 发起一局井字棋</Button> : <>
          <View className={`tic-board ${busy ? "busy" : ""}`}>{ticTacToe.board.map((stone, position) => <View key={position} className={ticTacToe.lastMove?.position === position ? "tic-cell last" : "tic-cell"} onClick={() => playTicTacToe(position)}><Text>{stone === 1 ? "×" : stone === 2 ? "○" : ""}</Text></View>)}</View>
          <Text className="game-tip">{busy ? "正在确认这个格子…" : `${ticTacToe.moveCount} 手 · ${ticTacToe.xUid === viewer.uid ? "你是 ×" : "你是 ○"}`}</Text>
          <View className="game-actions">{ticTacToe.status === "active" ? <Button className="outline-danger" disabled={busy} onClick={() => resign("ticTacToe")}>认输本局</Button> : <Button className="primary" loading={busy} onClick={() => start("ticTacToe")}>再来一局</Button>}<Button className="secondary" onClick={() => load()}>同步</Button></View>
        </>}
      </View>}

      {activeGame === "rps" && <View className="panel game-lobby-card rps-card">
        <View className="game-title-row"><View><Text className="kicker">默契猜拳 · 第 {rps?.round || 1} 轮</Text><Text className="subtitle">{!rps ? "偷偷选一个手势" : rps.revealed ? rps.winnerUid === null ? "你们居然一样，平局！" : rps.winnerUid === viewer.uid ? "这一轮你赢啦！" : `${partner.nickname} 赢下这一轮` : rps.myChoice ? rps.partnerReady ? "马上揭晓结果" : `等待 ${partner.nickname} 出拳` : rps.partnerReady ? `${partner.nickname} 已经选好了` : "你们的选择会同时揭晓"}</Text></View><Button className="game-refresh" loading={loading} onClick={() => load()}>↻</Button></View>
        {!rps ? <Button className="primary" loading={busy} onClick={() => start("rps")}>✊ 发起一轮默契猜拳</Button> : <>
          <View className="rps-versus"><View><Text className="role">我的手势</Text><Text className="rps-reveal">{rps.myChoice ? rpsMeta[rps.myChoice].icon : "❔"}</Text><Text>{rps.myChoice ? rpsMeta[rps.myChoice].label : "还没选"}</Text></View><Text className="game-versus">VS</Text><View><Text className="role">{partner.nickname}</Text><Text className="rps-reveal">{rps.revealed ? rpsMeta[rps.choices[partner.uid]].icon : rps.partnerReady ? "✅" : "❔"}</Text><Text>{rps.revealed ? rpsMeta[rps.choices[partner.uid]].label : rps.partnerReady ? "已出拳" : "等待中"}</Text></View></View>
          {rps.status === "active" && !rps.myChoice && <View className="rps-choices">{(Object.keys(rpsMeta) as RpsChoice[]).map((choice) => <Button key={choice} disabled={busy} onClick={() => chooseRps(choice)}><Text>{rpsMeta[choice].icon}</Text><Text>{rpsMeta[choice].label}</Text></Button>)}</View>}
          {rps.status === "active" && rps.myChoice && <View className="rps-waiting">🔒 已锁定你的选择，对方选择前不会公开。</View>}
          {rps.status === "complete" && <Button className="primary" loading={busy} onClick={() => start("rps")}>再猜一轮</Button>}
        </>}
      </View>}

      <View className="village-privacy-note">🎮 三款游戏都只属于绑定的两个人。五子棋和井字棋支持断线续玩；猜拳在双方都选择后才揭晓。</View>
    </>
  );
}
