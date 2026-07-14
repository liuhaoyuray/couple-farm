import { and, asc, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../../../db";
import { poopEntries, reactions, weightEntries } from "../../../db/schema";
import {
  authorizeRequest,
  ensureTrackerSchema,
  jsonError,
  members,
  otherMember,
} from "../../../lib/tracker";

const DAY = 24 * 60 * 60 * 1000;

const praiseMessages = [
  "今天也很棒，奖励一颗星星！",
  "稳稳记录的人最厉害啦。",
  "给认真生活的你点个赞！",
];

const teaseMessages = [
  "农场小喇叭：快来打卡啦！",
  "体重秤和小马桶都等困了。",
  "今日份轻轻嘲讽已经送达！",
];

function randomMessage(kind: "like" | "tease") {
  const choices = kind === "like" ? praiseMessages : teaseMessages;
  return choices[Math.floor(Math.random() * choices.length)];
}

function parseOccurrence(value: unknown) {
  const timestamp = typeof value === "number" ? value : Number(value);
  const now = Date.now();
  if (!Number.isFinite(timestamp)) return null;
  if (timestamp > now + 5 * 60 * 1000 || timestamp < now - 30 * DAY) return null;
  return Math.round(timestamp);
}

export async function GET(request: Request) {
  const viewer = await authorizeRequest(request);
  if (!viewer) return jsonError("这条入口链接无效，请使用属于你的专属链接。", 401);

  try {
    await ensureTrackerSchema();
    const db = await getDb();
    const now = Date.now();

    const [weights, poops, recentReactions] = await Promise.all([
      db
        .select()
        .from(weightEntries)
        .where(gte(weightEntries.recordedAt, now - 190 * DAY))
        .orderBy(asc(weightEntries.recordedAt), asc(weightEntries.id)),
      db
        .select()
        .from(poopEntries)
        .where(gte(poopEntries.occurredAt, now - 45 * DAY))
        .orderBy(asc(poopEntries.occurredAt), asc(poopEntries.id)),
      db
        .select()
        .from(reactions)
        .where(gte(reactions.createdAt, now - 30 * DAY))
        .orderBy(desc(reactions.createdAt), desc(reactions.id))
        .limit(40),
    ]);

    return Response.json({
      viewer,
      profiles: members,
      weights,
      poops,
      reactions: recentReactions,
      serverTime: now,
    });
  } catch (error) {
    console.error("tracker GET failed", error);
    return jsonError("小农场暂时打了个盹，请稍后再刷新一次。", 500);
  }
}

export async function POST(request: Request) {
  const viewer = await authorizeRequest(request);
  if (!viewer) return jsonError("这条入口链接无效，请使用属于你的专属链接。", 401);

  try {
    await ensureTrackerSchema();
    const db = await getDb();
    const payload = (await request.json()) as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const now = Date.now();

    if (action === "add-weight") {
      const weightKg = Number(payload.weightKg);
      const recordedAt = parseOccurrence(payload.occurredAt);
      if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 250) {
        return jsonError("请输入25到250千克之间的体重。");
      }
      if (!recordedAt) return jsonError("记录时间不正确，请重新选择。");

      const [entry] = await db
        .insert(weightEntries)
        .values({
          member: viewer,
          weightKg: Math.round(weightKg * 10) / 10,
          recordedAt,
          createdAt: now,
        })
        .returning();
      return Response.json({ entry }, { status: 201 });
    }

    if (action === "add-poop") {
      const occurredAt = parseOccurrence(payload.occurredAt);
      if (!occurredAt) return jsonError("记录时间不正确，请重新选择。");

      const [entry] = await db
        .insert(poopEntries)
        .values({ member: viewer, occurredAt, createdAt: now })
        .returning();
      return Response.json({ entry }, { status: 201 });
    }

    if (action === "react") {
      const kind = payload.kind === "like" ? "like" : payload.kind === "tease" ? "tease" : null;
      if (!kind) return jsonError("没有认出这次互动，再点一次试试吧。");
      const target = otherMember(viewer);
      const [reaction] = await db
        .insert(reactions)
        .values({
          fromMember: viewer,
          toMember: target,
          kind,
          message: randomMessage(kind),
          createdAt: now,
        })
        .returning();
      return Response.json({ reaction }, { status: 201 });
    }

    if (action === "delete-weight" || action === "delete-poop") {
      const id = Number(payload.id);
      if (!Number.isInteger(id) || id <= 0) return jsonError("没有找到这条记录。");
      if (action === "delete-weight") {
        await db
          .delete(weightEntries)
          .where(and(eq(weightEntries.id, id), eq(weightEntries.member, viewer)));
      } else {
        await db
          .delete(poopEntries)
          .where(and(eq(poopEntries.id, id), eq(poopEntries.member, viewer)));
      }
      return Response.json({ ok: true });
    }

    return jsonError("没有认出这个操作。");
  } catch (error) {
    console.error("tracker POST failed", error);
    return jsonError("刚才没有保存成功，请再试一次。", 500);
  }
}
