export const GTA6_TWITCH_SOURCES = [
  { login: "jolygames", label: "Шевцов" },
  { login: "steel", label: "Стилл" },
].map((channel) => ({ ...channel, url: `https://www.twitch.tv/${channel.login}` }));

export const GTA6_YOUTUBE_SOURCE = {
  login: "ijJXKz-1YnE", label: "Swich Games", url: "https://www.youtube.com/live/ijJXKz-1YnE",
};
