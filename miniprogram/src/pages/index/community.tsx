import { Button, Image, Input, Switch, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
/* eslint-disable jsx-a11y/alt-text -- Taro Image does not expose the HTML alt prop. */
import { useCallback, useEffect, useMemo, useState } from "react";
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

type CommunityStat = {
  key: string;
  label: string;
  value: number;
  suffix: string;
};

type CommunityComment = {
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

type CommunityPost = {
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
  shareStat?: CommunityStat | null;
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  followingFarm: boolean;
  ownFarm: boolean;
  comments: CommunityComment[];
  createdAt: number;
};

type CommunityFarm = {
  coupleId: string;
  farmName: string;
  bio: string;
  stats: CommunityStat[];
  vitality: number;
  following: boolean;
  ownFarm: boolean;
};

type CommunityData = {
  mode: "all" | "following";
  prompt: { id: string; text: string };
  settings: { enabled: boolean; bio: string; publicStats: string[] };
  stats: CommunityStat[];
  posts: CommunityPost[];
  leaderboard: CommunityFarm[];
};

const topicChoices = [
  ["daily", "🌱 日常"],
  ["question", "💬 提问"],
  ["milestone", "🏆 里程碑"],
  ["fun", "🎲 有趣一下"],
] as const;

const statChoices = [
  ["togetherDays", "相伴天数"],
  ["weeklyJointDays", "共同打卡"],
  ["weeklyCheers", "互相回应"],
  ["farmVitality", "农场活力"],
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

function Avatar({
  avatar,
  avatarFileId,
  color,
  small = false,
}: {
  avatar: string;
  avatarFileId?: string | null;
  color: string;
  small?: boolean;
}) {
  return (
    <View className={small ? "community-avatar small" : "community-avatar"} style={{ background: color }}>
      {avatarFileId
        ? <Image className="community-avatar-image" src={avatarFileId} mode="aspectFill" />
        : <Text>{avatar}</Text>}
    </View>
  );
}

export default function CommunityPanel({ viewer, couple }: { viewer: Viewer; couple: Couple }) {
  const [data, setData] = useState<CommunityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"all" | "following">("all");
  const [enabled, setEnabled] = useState(false);
  const [bio, setBio] = useState("");
  const [publicStats, setPublicStats] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [topic, setTopic] = useState<CommunityPost["topic"]>("daily");
  const [shareStatKey, setShareStatKey] = useState("");
  const [postImageFileId, setPostImageFileId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async (nextMode = mode, quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    const result = await cloudCall("community-feed", { mode: nextMode });
    if (result.status !== 200) {
      const message = typeof result.data.error === "string" ? result.data.error : "村口暂时没有打开。";
      const code = String(result.data.diagnosticId || result.data.code || "COMMUNITY_LOAD_FAILED");
      setError(`${message}（诊断码：${code}）`);
      setLoading(false);
      return;
    }
    const next = result.data as unknown as CommunityData;
    setData(next);
    setEnabled(next.settings.enabled);
    setBio(next.settings.bio || "");
    setPublicStats(next.settings.publicStats || []);
    setLoading(false);
  }, [mode]);

  useEffect(() => {
    const timer = setTimeout(() => void load(mode), 0);
    return () => clearTimeout(timer);
  }, [load, mode]);

  const action = async (
    name: string,
    payload: Record<string, unknown>,
    success: string,
    refresh = true,
  ) => {
    setBusy(true);
    setError(null);
    const result = await cloudCall(name, payload);
    setBusy(false);
    if (result.status < 200 || result.status >= 300) {
      const message = typeof result.data.error === "string" ? result.data.error : "操作没有成功，请再试一次。";
      if (["IMAGE_UNSAFE", "IMAGE_TOO_LARGE", "IMAGE_FORMAT_INVALID", "POST_IMAGE_INVALID"].includes(String(result.data.code || ""))) {
        setPostImageFileId(null);
      }
      setError(message);
      await Taro.showToast({ title: message, icon: "none", duration: 2800 });
      return null;
    }
    await Taro.showToast({ title: success, icon: "none" });
    if (refresh) await load(mode, true);
    return result;
  };

  const toggleStat = (key: string) => {
    setPublicStats((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
  };

  const saveSettings = async () => {
    await action("update-community-settings", { enabled, bio: bio.trim(), publicStats }, "社区名片保存啦");
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
      const previousFileId = postImageFileId;
      setPostImageFileId(uploaded.fileID);
      await deleteCloudFileQuietly(previousFileId);
    } catch (uploadError) {
      console.error("Community image upload failed", uploadError);
      const message = imageUploadErrorMessage(uploadError, "照片没有上传成功，请重试");
      if (message) await Taro.showToast({ title: message, icon: "none" });
    } finally {
      Taro.hideLoading();
    }
  };

  const publishPost = async () => {
    const result = await action("create-community-post", {
      content: draft.trim(),
      topic,
      promptId: topic === "question" ? data?.prompt.id : null,
      imageFileId: postImageFileId,
      shareStatKey: shareStatKey || null,
    }, "动态发到村口啦");
    if (result) {
      setDraft("");
      setTopic("daily");
      setShareStatKey("");
      setPostImageFileId(null);
    }
  };

  const removeDraftImage = async () => {
    const fileId = postImageFileId;
    setPostImageFileId(null);
    await deleteCloudFileQuietly(fileId);
  };

  const addComment = async (postId: string) => {
    const content = (commentDrafts[postId] || "").trim();
    if (!content) return Taro.showToast({ title: "先写一句留言吧", icon: "none" });
    const result = await action("add-community-comment", { postId, content }, "留言送到啦");
    if (result) setCommentDrafts((current) => ({ ...current, [postId]: "" }));
  };

  const report = async (type: "post" | "comment", id: string) => {
    try {
      const options = ["垃圾广告", "辱骂攻击", "泄露隐私", "不适内容", "其他"];
      const reasons = ["spam", "abuse", "privacy", "unsafe", "other"];
      const selected = await Taro.showActionSheet({ itemList: options });
      await action("report-community-content", { type, id, reason: reasons[selected.tapIndex] }, "已提交举报");
    } catch {
      // User cancelled the action sheet.
    }
  };

  const blockFarm = async (post: CommunityPost) => {
    const confirmed = await Taro.showModal({
      title: `屏蔽“${post.farmName}”？`,
      content: "之后不会再看到这个农场的动态。",
      confirmText: "确认屏蔽",
      confirmColor: "#b32a50",
    });
    if (confirmed.confirm) {
      await action("block-community-farm", { coupleId: post.authorCoupleId }, "已经屏蔽");
    }
  };

  const deleteContent = async (type: "post" | "comment", id: string) => {
    const confirmed = await Taro.showModal({ title: "删除这条内容？", confirmColor: "#b32a50" });
    if (confirmed.confirm) await action("delete-community-content", { type, id }, "已经删除");
  };

  const availableShareStats = useMemo(() => data?.stats || [], [data?.stats]);
  const communityActive = Boolean(data?.settings.enabled);

  if (loading) return <View className="panel community-loading">🌾 正在走去村口……</View>;
  if (!data) return <View className="panel community-loading"><Text>{error || "村口暂时没有打开。"}</Text><Button className="secondary" onClick={() => load(mode)}>重新进入</Button></View>;

  return (
    <>
      <View className="page-heading community-heading">
        <Text className="kicker">情侣农场村 · 0.3.0</Text>
        <Text className="title">来村口看看大家</Text>
        <Text className="description">只有主动发布和勾选的内容会公开，体重和如厕原始记录永远留在两个人的农场里。</Text>
      </View>

      {error && <View className="error-banner"><Text>{error}</Text><Button onClick={() => setError(null)}>×</Button></View>}

      <View className="panel community-settings">
        <View className="setting-row">
          <View><Text className="subtitle">公开我们的农场名片</Text><Text className="role">开启后才能发帖、留言、点赞和关注</Text></View>
          <Switch checked={enabled} color="#7457ff" onChange={(event) => setEnabled(event.detail.value)} />
        </View>
        <Input className="field" value={bio} onInput={(event) => setBio(event.detail.value)} maxlength={80} placeholder="介绍一下你们的农场（选填）" />
        <Text className="community-label">愿意公开的趣味数据（默认不公开）</Text>
        <View className="community-stat-picker">
          {statChoices.map(([key, label]) => <Button key={key} className={publicStats.includes(key) ? "active" : ""} onClick={() => toggleStat(key)}>{publicStats.includes(key) ? "✓ " : ""}{label}</Button>)}
        </View>
        <Button className="primary" loading={busy} onClick={saveSettings}>保存社区名片</Button>
      </View>

      <View className="community-prompt">
        <Text className="prompt-icon">💌</Text>
        <View><Text className="kicker">今日村口话题</Text><Text className="activity-title">{data.prompt.text}</Text></View>
        {communityActive && <Button onClick={() => { setTopic("question"); setDraft(data.prompt.text); }}>去回答</Button>}
      </View>

      {communityActive && <View className="panel community-composer">
        <View className="community-author-row">
          <Avatar avatar={viewer.avatar} avatarFileId={viewer.avatarFileId} color={viewer.color} />
          <View><Text className="activity-title">{couple.farmName}</Text><Text className="role">由 {viewer.nickname} 发布</Text></View>
        </View>
        <View className="community-topic-picker">{topicChoices.map(([key, label]) => <Button key={key} className={topic === key ? "active" : ""} onClick={() => setTopic(key)}>{label}</Button>)}</View>
        <Textarea className="textarea community-textarea" value={draft} onInput={(event) => setDraft(event.detail.value)} maxlength={300} placeholder="分享一件今天发生的小事，或者问问其他情侣……" />
        {postImageFileId && <View className="community-image-preview"><Image src={postImageFileId} mode="aspectFill" /><Button onClick={removeDraftImage}>移除</Button></View>}
        <View className="composer-tools"><Button onClick={choosePostImage}>📷 {postImageFileId ? "换照片" : "加一张照片"}</Button><Text>{draft.length}/300</Text></View>
        {availableShareStats.length > 0 && <><Text className="community-label">附上一张趣味数据卡（选填）</Text><View className="community-stat-picker"><Button className={!shareStatKey ? "active" : ""} onClick={() => setShareStatKey("")}>不附加</Button>{availableShareStats.map((stat) => <Button key={stat.key} className={shareStatKey === stat.key ? "active" : ""} onClick={() => setShareStatKey(stat.key)}>{stat.label}</Button>)}</View></>}
        <Button className="primary" loading={busy} onClick={publishPost}>发布到村口</Button>
      </View>}

      <View className="panel community-ranking">
        <View className="section-heading"><View><Text className="kicker">农场活力榜</Text><Text className="subtitle">一起认真生活的农场</Text></View><Text className="role">只统计自愿公开项</Text></View>
        <View className="ranking-scroll">{data.leaderboard.map((farm, index) => <View className="ranking-card" key={farm.coupleId}><Text className="rank-number">{index + 1}</Text><View className="ranking-copy"><Text className="activity-title">{farm.farmName}</Text><Text className="role">{farm.bio || "一座安静长大的小农场"}</Text><View className="mini-stat-row">{farm.stats.slice(0, 3).map((stat) => <Text key={stat.key}>{stat.label} {stat.value}{stat.suffix}</Text>)}</View></View>{!farm.ownFarm && <Button disabled={!communityActive} onClick={() => action("toggle-community-follow", { coupleId: farm.coupleId }, farm.following ? "已取消关注" : "关注成功")}>{farm.following ? "已关注" : "+ 关注"}</Button>}</View>)}</View>
      </View>

      <View className="community-feed-tabs"><Button className={mode === "all" ? "active" : ""} onClick={() => setMode("all")}>🌾 全村动态</Button><Button className={mode === "following" ? "active" : ""} onClick={() => setMode("following")}>💗 我的关注</Button></View>

      <View className="community-feed">
        {data.posts.map((post) => <View className="panel community-post" key={post.id}>
          <View className="post-head">
            <Avatar avatar={post.authorAvatar} avatarFileId={post.authorAvatarFileId} color={post.authorColor} />
            <View><Text className="activity-title">{post.farmName}</Text><Text className="role">{post.authorNickname} · {timeAgo(post.createdAt)}</Text></View>
            {!post.ownFarm && <Button className="post-follow" disabled={!communityActive} onClick={() => action("toggle-community-follow", { coupleId: post.authorCoupleId }, post.followingFarm ? "已取消关注" : "关注成功")}>{post.followingFarm ? "已关注" : "+ 关注"}</Button>}
          </View>
          <Text className="post-topic">{topicChoices.find(([key]) => key === post.topic)?.[1] || "🌱 日常"}</Text>
          <Text className="post-content">{post.content}</Text>
          {post.imageFileId && <Image className="post-image" src={post.imageFileId} mode="aspectFill" />}
          {post.shareStat && <View className="shared-stat-card"><Text>{post.shareStat.label}</Text><Text className="shared-stat-value">{post.shareStat.value}<Text>{post.shareStat.suffix}</Text></Text><Text>由农场主人主动公开</Text></View>}
          <View className="post-actions">
            <Button className={post.likedByViewer ? "liked" : ""} disabled={!communityActive || busy} onClick={() => action("toggle-community-like", { postId: post.id }, post.likedByViewer ? "收回小花" : "送出小花")}>{post.likedByViewer ? "🌸" : "🌼"} {post.likeCount}</Button>
            <Button disabled={!communityActive}>💬 {post.commentCount}</Button>
            {post.ownFarm ? <Button onClick={() => deleteContent("post", post.id)}>删除</Button> : <Button onClick={() => report("post", post.id)}>举报</Button>}
            {!post.ownFarm && <Button onClick={() => blockFarm(post)}>屏蔽</Button>}
          </View>
          {post.comments.length > 0 && <View className="community-comments">{post.comments.map((comment) => <View className="community-comment" key={comment.id}><Avatar small avatar={comment.authorAvatar} avatarFileId={comment.authorAvatarFileId} color={comment.authorColor} /><View><Text className="comment-name">{comment.authorNickname} · {comment.farmName}</Text><Text className="comment-content">{comment.content}</Text><Text className="role">{timeAgo(comment.createdAt)}</Text></View>{comment.authorUid === viewer.uid ? <Button onClick={() => deleteContent("comment", comment.id)}>×</Button> : <Button onClick={() => report("comment", comment.id)}>···</Button>}</View>)}</View>}
          {communityActive && <View className="comment-box"><Input value={commentDrafts[post.id] || ""} onInput={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.detail.value }))} maxlength={120} placeholder="给这个农场留句话……" /><Button loading={busy} onClick={() => addComment(post.id)}>留言</Button></View>}
        </View>)}
        {!data.posts.length && <View className="panel empty">🌱 这里还没有动态，成为第一个来村口打招呼的农场吧。</View>}
      </View>
    </>
  );
}
