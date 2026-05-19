export type ThemeType = 'magazine' | 'swiss' | 'warmGold' | 'softTech' | 'science' | 'paper';

export interface ThemeConfig {
  id: ThemeType;
  name: string;
  bgClass: string;
  textClass: string;
  headingClass: string;
  fontClass: string;
  footerClass: string;
  borderClass?: string;
  accentClass?: string;
  containerClass?: string;
}

export const themes: Record<ThemeType, ThemeConfig> = {
  magazine: {
    id: 'magazine',
    name: '杂志书页',
    bgClass: 'bg-[#fcfbf9]',
    textClass: 'text-[#1a1a1a]',
    headingClass: 'text-[#111111] font-bold border-b border-[#dddddd] pb-4 mb-8',
    fontClass: 'font-serif',
    footerClass: 'text-[#888888]',
    containerClass: 'magazine-lines' // Handled in global CSS or style
  },
  swiss: {
    id: 'swiss',
    name: '瑞士红黑',
    bgClass: 'bg-[#f5f5f5]',
    textClass: 'text-[#111111]',
    headingClass: 'text-[#111111] font-bold mb-8',
    fontClass: 'font-sans tracking-wide',
    footerClass: 'text-[#666666]',
    accentClass: 'text-[#d62828]',
    borderClass: 'border-t-[16px] border-[#d62828]',
    containerClass: 'swiss-grid'
  },
  warmGold: {
    id: 'warmGold',
    name: '暖金极简',
    bgClass: 'bg-[#faf7f2]',
    textClass: 'text-[#4a3f35]',
    headingClass: 'text-[#8c6b4a] font-serif mb-8',
    fontClass: 'font-serif',
    footerClass: 'text-[#a6927d] italic',
    containerClass: 'border-[12px] border-[#ede3d1] m-8 rounded-sm'
  },
  softTech: {
    id: 'softTech',
    name: '柔和科技',
    bgClass: 'bg-[#eef2f5]',
    textClass: 'text-[#2c3e50]',
    headingClass: 'text-[#34495e] font-medium border-b border-[#bdc3c7] pb-4 mb-8',
    fontClass: 'font-sans',
    footerClass: 'text-[#7f8c8d]',
    containerClass: 'bg-white m-8 rounded-[32px] shadow-sm'
  },
  science: {
    id: 'science',
    name: '科学期刊',
    bgClass: 'bg-[#f8f9fa]',
    textClass: 'text-[#2b3a4a]',
    headingClass: 'text-[#1b3a5a] font-bold border-b-2 border-[#1b3a5a] pb-2 mb-8',
    fontClass: 'font-serif',
    footerClass: 'text-[#555555]',
    containerClass: 'science-lines'
  },
  paper: {
    id: 'paper',
    name: '空白纸感',
    bgClass: 'bg-[#f9f8f4]',
    textClass: 'text-[#2b2b2b]',
    headingClass: 'text-[#1a1a1a] font-medium border-b border-[#dcd7cb] pb-4 mb-8',
    fontClass: 'font-serif',
    footerClass: 'text-[#9e978e]',
    containerClass: 'paper-texture'
  }
};
