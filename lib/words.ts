export const WORD_PAIRS = [
  ['牛奶', '豆浆'], ['可乐', '雪碧'], ['包子', '饺子'], ['火锅', '麻辣烫'],
  ['口红', '唇膏'], ['雨伞', '遮阳伞'], ['地铁', '公交车'], ['钢琴', '电子琴'],
  ['电影', '电视剧'], ['微信', 'QQ'], ['橙子', '橘子'], ['玫瑰', '月季'],
  ['篮球', '足球'], ['咖啡', '奶茶'], ['相机', '摄像机'], ['森林', '公园'],
  ['台灯', '手电筒'], ['耳机', '音响'], ['密码', '暗号'], ['老板', '领导'],
] as const;

export function randomWordPair(random = Math.random): [string, string] {
  const pair = WORD_PAIRS[Math.floor(random() * WORD_PAIRS.length)];
  return random() > 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]];
}
