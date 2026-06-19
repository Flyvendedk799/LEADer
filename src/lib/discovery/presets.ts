export const DISCOVERY_PRESETS = [
  {
    id: "funded-mvp",
    label: "EHSYS/Beyond Beta",
    description: "Find funded startup and accelerator procurement tasks that look like concrete supplier assignments.",
    focus: ["EHSYS", "Beyond Beta", "teknisk sparring", "produktroadmap"],
    query:
      "EHSYS indkøb Beyond Beta teknisk sparring produkt roadmap MVP prototype software AI leverandør",
  },
  {
    id: "software-udbud",
    label: "Software udbud",
    description: "Look for active Danish software, app, web, integration and IT consultancy tenders with application routes.",
    focus: ["softwareudvikling", "tilbudsfrist", "IT konsulent", "under tærskelværdi"],
    query:
      "udbud softwareudvikling webapp app udvikling IT konsulent under tærskelværdi Danmark",
  },
  {
    id: "ai-automation",
    label: "AI automation",
    description: "Search for smaller AI, automation, data, chatbot and proof-of-concept work that fits a solo builder.",
    focus: ["AI", "automatisering", "proof of concept", "chatbot"],
    query:
      "AI automatisering proof of concept dokumentklassificering chatbot fullstack udvikler Danmark tilskud",
  },
  {
    id: "smv-digital",
    label: "SMV:Digital",
    description: "Find voucher-style SME digitalisation tasks where the company has budget for an external supplier.",
    focus: ["voucher", "digitalisering", "integration", "webudvikling"],
    query:
      "SMV Digital digitalisering rådgivning software integration webudvikling leverandør voucher Danmark",
  },
] as const;
