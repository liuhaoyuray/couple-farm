import { Button, Image, Input, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
/* eslint-disable jsx-a11y/alt-text -- Taro Image does not expose the HTML alt prop. */
import { useCallback, useEffect, useState } from "react";
import { cloudCall } from "../../cloud";
import { deleteCloudFileQuietly, imageUploadErrorMessage, prepareImageForUpload } from "../../media";

type Viewer = {
  uid: string;
  nickname: string;
  avatar: string;
  avatarFileId?: string | null;
  color: string;
};

type Couple = {
  id: string;
  farmName: string;
};

type Village = {
  id: string;
  name: string;
  description: string;
  ownerCoupleId: string;
  inviteCode: string;
  inviteExpiresAt: number | null;
  memberCount: number;
};

type VillageMember = {
  coupleId: string;
  farmName: string;
  role: "owner" | "member";
  joinedAt: number;
  people: Viewer[];
};

type VillageHub = {
  village: Village | null;
  membership: { role: "owner" | "member"; joinedAt: number } | null;
  members: VillageMember[];
  viewerCoupleId: string;
  prompt: { id: string; text: string };
};

type VillageComment = {
  id: string;
  authorUid: string;
  authorCoupleId: string;
  authorNickname: string;
  authorAvatar: string;
  authorAvatarFileId?: string | null;
  authorColor: string;
  farmName: string;
  content: string;
  createdAt: number;
};

type VillagePost = {
  id: string;
  authorUid: string;
  authorCoupleId: string;
  authorNickname: string;
  authorAvatar: string;
  authorAvatarFileId?: string | null;
  authorColor: string;
  farmName: string;
  content: string;
  topic: "daily" | "question" | "milestone" | "fun";
  imageFileId?: string | null;
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  ownCouple: boolean;
  comments: VillageComment[];
  createdAt: number;
};

type VillageFeed = {
  village: Village;
  prompt: { id: string; text: string };
  posts: VillagePost[];
  serviceState: "healthy" | "degraded";
  warningCount: number;
};

const topicChoices = [
  ["daily", "🌱 日常"],
  ["question", "💬 约局"],
  ["milestone", "🏆 里程碑"],
  ["fun", "🎲 有趣一下"],
] as const;

function timeAgo(timestamp: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function Avatar({ person, small = false }: { person: Viewer; small?: boolean }) {
  return (
    <View className={small ? "community-avatar small" : "community-avatar"} style={{ background: person.color }}>
      {person.avatarFileId
        ? <Image className="community-avatar-image" src={person.avatarFileId} mode="aspectFill" />
        : <Text>{person.avatar}</Text>}
    </View>
  );
}

function resultMessage(data: Record<string, unknown>, fallback: string) {
  const message = typeof data.error === "string" ? data.error : fallback;
  const diagnostic = data.diagnosticId || data.code;
  return diagnostic ? `${message}（诊断码：${String(diagnostic)}）` : message;
}

export default function VillagePanel({ viewer, couple }: { viewer: Viewer; couple: Couple }) {
  const [hub, setHub] = useState<VillageHub | null>(null);
  const [feed, setFeed] = useState<VillageFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [villageName, setVillageName] = useState("");
  const [villageDescription, setVillageDescription] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [draft, setDraft] = useState("");
  const [topic, setTopic] = useState<VillagePost["topic"]>("daily");
  const [postImageFileId, setPostImageFileId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    const hubResult = await cloudCall("village-hub");
    if (hubResult.status !== 200) {
      setHub(null);
      setFeed(null);
      setError(resultMessage(hubResult.data, "村庄暂时没有打开。"));
      setLoading(false);
      return;
    }
    const nextHub = hubResult.data as unknown as VillageHub;
    setHub(nextHub);
    if (nextHub.village) {
      setVillageName(nextHub.village.name);
      setVillageDescription(nextHub.village.description || "");
      const feedResult = await cloudCall("village-feed");
      if (feedResult.status === 200) setFeed(feedResult.data as unknown as VillageFeed);
      else {
        setFeed(null);
        setError(resultMessage(feedResult.data, "村庄动态暂时没有加载。"));
      }
    } else {
      setFeed(null);
      setVillageName("");
      setVillageDescription("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const action = async (name: string, payload: Record<string, unknown>, success: string) => {
    setBusy(true);
    setError(null);
    const result = await cloudCall(name, payload);
    setBusy(false);
    if (result.status < 200 || result.status >= 300) {
      const message = resultMessage(result.data, "操作没有成功，请再试一次。");
      if (["IMAGE_UNSAFE", "IMAGE_TOO_LARGE", "IMAGE_FORMAT_INVALID", "POST_IMAGE_INVALID"].includes(String(result.data.code || ""))) {
        setPostImageFileId(null);
      }
      setError(message);
      await Taro.showToast({ title: message, icon: "none", duration: 3000 });
      return null;
    }
    await Taro.showToast({ title: success, icon: "none" });
    await load(true);
    return result;
  };

  const createVillage = async () => {
    const result = await action("create-village", {
      name: villageName.trim(),
      description: villageDescription.trim(),
    }, "村庄建好啦");
    if (result) setJoinCode("");
  };

  const joinVillage = async () => {
    const result = await action("join-village", { code: joinCode }, "已经搬进村庄啦");
    if (result) setJoinCode("");
  };

  const choosePostImage = async () => {
    try {
      const chosen = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"],
      });
      const sourcePath = chosen.tempFiles[0]?.tempFilePath;
      if (!sourcePath) return;
      await Taro.showLoading({ title: "正在种下照片" });
      const filePath = await prepareImageForUpload(sourcePath, 1440);
      const uploaded = await Taro.cloud.uploadFile({
        cloudPath: `community/${viewer.uid}/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`,
        filePath,
      });
      const previous = postImageFileId;
      setPostImageFileId(uploaded.fileID);
      await deleteCloudFileQuietly(previous);
    } catch (uploadError) {
      console.error("Village image upload failed", uploadError);
      const message = imageUploadErrorMessage(uploadError, "照片没有上传成功，请重试");
      if (message) await Taro.showToast({ title: message, icon: "none" });
    } finally {
      Taro.hideLoading();
    }
  };

  const publishPost = async () => {
    const result = await action("create-village-post", {
      content: draft.trim(),
      topic,
      promptId: topic === "question" ? hub?.prompt.id : null,
      imageFileId: postImageFileId,
    }, "已经分享到村里");
    if (result) {
      setDraft("");
      setTopic("daily");
      setPostImageFileId(null);
    }
  };

  const addComment = async (postId: string) => {
    const content = (commentDrafts[postId] || "").trim();
    if (!content) return Taro.showToast({ title: "先写一句留言吧", icon: "none" });
    const result = await action("add-village-comment", { postId, content }, "留言送到啦");
    if (result) setCommentDrafts((current) => ({ ...current, [postId]: "" }));
  };

  const deleteContent = async (type: "post" | "comment", id: string) => {
    const confirmed = await Taro.showModal({ title: "删除这条内容？", confirmColor: "#b32a50" });
    if (confirmed.confirm) await action("delete-village-content", { type, id }, "已经删除");
  };

  const reportContent = async (type: "post" | "comment", id: string) => {
    try {
      const labels = ["垃圾广告", "辱骂攻击", "泄露隐私", "不适内容", "其他"];
      const reasons = ["spam", "abuse", "privacy", "unsafe", "other"];
      const selected = await Taro.showActionSheet({ itemList: labels });
      await action("report-village-content", { type, id, reason: reasons[selected.tapIndex] }, "已提交举报");
    } catch {
      // User cancelled the action sheet.
    }
  };

  const exitVillage = async (dissolve: boolean) => {
    const confirmed = await Taro.showModal({
      title: dissolve ? "解散整个村庄？" : "离开这个村庄？",
      content: dissolve ? "所有情侣都会离开，历史动态不再展示。" : "离开后将看不到村里的动态。",
      confirmText: dissolve ? "确认解散" : "确认离开",
      confirmColor: "#b32a50",
    });
    if (confirmed.confirm) await action(dissolve ? "dissolve-village" : "leave-village", {}, dissolve ? "村庄已解散" : "已经离开村庄");
  };

  if (loading) return <View className="panel community-loading">🌾 正在走进熟人村庄……</View>;
  if (!hub) return <View className="panel community-loading"><Text>{error || "村庄暂时没有打开。"}</Text><Button className="secondary" onClick={() => load()}>重新进入</Button></View>;

  if (!hub.village) {
    return (
      <>
        <View className="page-heading community-heading">
          <Text className="kicker">我们俩的小田地 · 0.6.0</Text>
          <Text className="title">和认识的情侣住进同一个村</Text>
          <Text className="description">村庄不是公开广场。只有拿到邀请码的情侣才能加入、看动态和留言，体重与如厕记录永远不会进入村庄。</Text>
        </View>
        {error && <View className="error-banner"><Text>{error}</Text><Button onClick={() => setError(null)}>×</Button></View>}
        <View className="panel village-create-card">
          <Text className="kicker">我是发起人</Text>
          <Text className="subtitle">创建一个熟人村庄</Text>
          <Input className="field" value={villageName} onInput={(event) => setVillageName(event.detail.value)} maxlength={16} placeholder="例如 周末吃喝村" />
          <Textarea className="textarea" value={villageDescription} onInput={(event) => setVillageDescription(event.detail.value)} maxlength={80} placeholder="写一句村庄介绍（选填）" />
          <Button className="primary" loading={busy} onClick={createVillage}>创建村庄并生成邀请码</Button>
        </View>
        <View className="panel">
          <Text className="kicker">朋友已经建村</Text>
          <Text className="subtitle">用 8 位邀请码加入</Text>
          <Input className="field code-input" value={joinCode} onInput={(event) => setJoinCode(event.detail.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} maxlength={8} placeholder="输入村庄邀请码" />
          <Button className="secondary" loading={busy} onClick={joinVillage}>加入这个村庄</Button>
        </View>
        <View className="village-privacy-note">🔒 每对情侣同时只能加入一个村庄；邀请码有效期 30 天，可由村长随时更换。</View>
      </>
    );
  }

  const owner = hub.membership?.role === "owner";
  return (
    <>
      <View className="village-hero">
        <Text className="kicker">熟人村庄 · {hub.village.memberCount} 对情侣</Text>
        <Text className="farm-title">{hub.village.name}</Text>
        <Text className="description">{hub.village.description || "一群认识的人，一起分享认真生活的小事。"}</Text>
        <View className="village-invite-row">
          <View><Text className="role">村庄邀请码</Text><Text className="village-invite-code">{hub.village.inviteCode}</Text></View>
          <Button onClick={() => Taro.setClipboardData({ data: hub.village?.inviteCode || "" })}>复制邀请</Button>
        </View>
      </View>

      {error && <View className="error-banner"><Text>{error}</Text><Button onClick={() => setError(null)}>×</Button></View>}
      {feed?.serviceState === "degraded" && <View className="community-service-note"><Text>🌤 村庄已连上，但部分留言暂时没有加载。主动态仍可使用。</Text><Button onClick={() => load(true)}>刷新</Button></View>}

      <View className="panel village-members-card">
        <View className="section-heading"><View><Text className="kicker">村民名册</Text><Text className="subtitle">都是通过邀请码加入的熟人</Text></View><Text className="role">最多 24 对</Text></View>
        <View className="village-member-list">{hub.members.map((member) => <View className="village-member" key={member.coupleId}><View className="village-avatar-stack">{member.people.map((person) => <Avatar key={person.uid} person={person} small />)}</View><View><Text className="activity-title">{member.farmName}</Text><Text className="role">{member.people.map((person) => person.nickname).join(" & ")} · {member.role === "owner" ? "村长" : "村民"}</Text></View></View>)}</View>
      </View>

      {owner && <View className="panel village-owner-card">
        <Text className="kicker">村长工具</Text><Text className="subtitle">村庄资料与邀请</Text>
        <Input className="field" value={villageName} onInput={(event) => setVillageName(event.detail.value)} maxlength={16} placeholder="村庄名称" />
        <Textarea className="textarea" value={villageDescription} onInput={(event) => setVillageDescription(event.detail.value)} maxlength={80} placeholder="村庄介绍" />
        <Button className="secondary" loading={busy} onClick={() => action("update-village", { name: villageName.trim(), description: villageDescription.trim() }, "村庄资料保存啦")}>保存村庄资料</Button>
        <Button className="text-button" loading={busy} onClick={() => action("regenerate-village-invite", {}, "新邀请码生成啦")}>更换邀请码</Button>
      </View>}

      <View className="community-prompt">
        <Text className="prompt-icon">💌</Text><View><Text className="kicker">今天聊什么</Text><Text className="activity-title">{hub.prompt.text}</Text></View>
        <Button onClick={() => { setTopic("question"); setDraft(hub.prompt.text); }}>去回答</Button>
      </View>

      <View className="panel community-composer">
        <View className="community-author-row"><Avatar person={viewer} /><View><Text className="activity-title">{couple.farmName}</Text><Text className="role">由 {viewer.nickname} 分享给村民</Text></View></View>
        <View className="community-topic-picker">{topicChoices.map(([key, label]) => <Button key={key} className={topic === key ? "active" : ""} onClick={() => setTopic(key)}>{label}</Button>)}</View>
        <Textarea className="textarea community-textarea" value={draft} onInput={(event) => setDraft(event.detail.value)} maxlength={300} placeholder="分享日常、约饭、问问题，只有村民能看到……" />
        {postImageFileId && <View className="community-image-preview"><Image src={postImageFileId} mode="aspectFill" /><Button onClick={async () => { const fileId = postImageFileId; setPostImageFileId(null); await deleteCloudFileQuietly(fileId); }}>移除</Button></View>}
        <View className="composer-tools"><Button onClick={choosePostImage}>📷 {postImageFileId ? "换照片" : "加一张照片"}</Button><Text>{draft.length}/300</Text></View>
        <Button className="primary" loading={busy} onClick={publishPost}>分享给村民</Button>
      </View>

      <View className="community-feed">
        {(feed?.posts || []).map((post) => <View className="panel community-post" key={post.id}>
          <View className="post-head"><Avatar person={{ uid: post.authorUid, nickname: post.authorNickname, avatar: post.authorAvatar, avatarFileId: post.authorAvatarFileId, color: post.authorColor }} /><View><Text className="activity-title">{post.farmName}</Text><Text className="role">{post.authorNickname} · {timeAgo(post.createdAt)}</Text></View></View>
          <Text className="post-topic">{topicChoices.find(([key]) => key === post.topic)?.[1] || "🌱 日常"}</Text>
          <Text className="post-content">{post.content}</Text>
          {post.imageFileId && <Image className="post-image" src={post.imageFileId} mode="aspectFill" />}
          <View className="post-actions"><Button className={post.likedByViewer ? "liked" : ""} disabled={busy} onClick={() => action("toggle-village-like", { postId: post.id }, post.likedByViewer ? "收回小花" : "送出小花")}>{post.likedByViewer ? "🌸" : "🌼"} {post.likeCount}</Button><Button disabled>💬 {post.commentCount}</Button>{post.ownCouple ? <Button onClick={() => deleteContent("post", post.id)}>删除</Button> : <Button onClick={() => reportContent("post", post.id)}>举报</Button>}</View>
          {post.comments.length > 0 && <View className="community-comments">{post.comments.map((comment) => <View className="community-comment" key={comment.id}><Avatar small person={{ uid: comment.authorUid, nickname: comment.authorNickname, avatar: comment.authorAvatar, avatarFileId: comment.authorAvatarFileId, color: comment.authorColor }} /><View><Text className="comment-name">{comment.authorNickname} · {comment.farmName}</Text><Text className="comment-content">{comment.content}</Text><Text className="role">{timeAgo(comment.createdAt)}</Text></View>{comment.authorUid === viewer.uid ? <Button onClick={() => deleteContent("comment", comment.id)}>×</Button> : <Button onClick={() => reportContent("comment", comment.id)}>···</Button>}</View>)}</View>}
          <View className="comment-box"><Input value={commentDrafts[post.id] || ""} onInput={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.detail.value }))} maxlength={120} placeholder="给村民留句话……" /><Button loading={busy} onClick={() => addComment(post.id)}>留言</Button></View>
        </View>)}
        {!feed?.posts.length && <View className="panel empty">🌱 村里还没有动态，先和熟人们打个招呼吧。</View>}
      </View>

      <View className="panel village-exit-card"><Text className="kicker">村庄管理</Text><Text className="description small">离开或解散不会删除你们两个人自己的田地记录。</Text>{owner ? <Button className="outline-danger" onClick={() => exitVillage(true)}>解散整个村庄</Button> : <Button className="outline-danger" onClick={() => exitVillage(false)}>离开这个村庄</Button>}</View>
    </>
  );
}
