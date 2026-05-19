import React, { forwardRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { ThemeType, themes } from './XhsTheme';

interface XhsCardProps {
  content: string;
  theme: ThemeType;
  teamName: string;
  isCover?: boolean;
  title?: string;
  author?: string;
  fontFamily: string;
  fontSize: number;
  hasNoise: boolean;
}

export const XhsCard = forwardRef<HTMLDivElement, XhsCardProps>(
  ({ content, theme, teamName, isCover, title, author, fontFamily, fontSize, hasNoise }, ref) => {
    const themeConfig = themes[theme];
    
    // Scale the base sizes based on user's fontSize relative to 22px
    const scale = fontSize / 22;

    return (
      <div
        ref={ref}
        className={`w-[1080px] h-[1440px] flex flex-col relative overflow-hidden ${themeConfig.bgClass} ${themeConfig.borderClass || ''} ${themeConfig.fontClass || ''}`}
        style={{
          boxSizing: 'border-box',
          textRendering: 'optimizeLegibility',
          WebkitFontSmoothing: 'antialiased',
          fontFamily: fontFamily,
        }}
      >
        {/* Noise overlay (from user settings) */}
        {hasNoise && (
          <div className="absolute inset-0 z-0 opacity-[0.04] pointer-events-none mix-blend-multiply" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
          }} />
        )}
        
        {/* Theme Background Grids / Textures */}
        {theme === 'swiss' && (
          <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }} />
        )}
        {theme === 'science' && (
          <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{
            backgroundImage: 'linear-gradient(90deg, #1b3a5a 1px, transparent 1px)',
            backgroundSize: '216px 100%'
          }} />
        )}
        {theme === 'magazine' && (
          <div className="absolute inset-0 z-0 opacity-[0.06] pointer-events-none" style={{
            backgroundImage: 'linear-gradient(90deg, #000 1px, transparent 1px)',
            backgroundSize: '120px 100%'
          }} />
        )}
        {theme === 'paper' && (
          <div className="absolute inset-0 z-0 opacity-[0.06] pointer-events-none mix-blend-multiply" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.5' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
          }} />
        )}

        <div className={`relative z-10 flex-1 flex flex-col ${themeConfig.containerClass || ''}`}>
          {isCover ? (
          <div className="flex-1 flex flex-col justify-center items-start p-24 text-left">
            <h1 
              className={`font-bold leading-tight ${themeConfig.headingClass.replace(/border-b(-[0-9]+)?|pb-[0-9]+|mb-[0-9]+/g, '')}`}
              style={{ fontSize: fontSize * 2.5 }}
            >
              {title || '请输入标题'}
            </h1>
            <div className={`w-full border-b-2 my-12 ${themeConfig.borderClass ? 'border-current' : 'border-gray-300'} ${themeConfig.textClass} opacity-40`} />
            {author && (
              <div className={`opacity-90 ${themeConfig.textClass}`} style={{ fontSize: fontSize * 1.2 }}>
                {author}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-20 py-24">
            <div className={`prose prose-2xl max-w-none ${themeConfig.textClass}`}>
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  h1: ({node, ...props}) => <h1 className={`mt-12 mb-8 font-bold ${themeConfig.headingClass}`} style={{ fontSize: fontSize * 2 }} {...props} />,
                  h2: ({node, ...props}) => <h2 className={`mt-12 mb-8 font-bold ${themeConfig.headingClass}`} style={{ fontSize: fontSize * 1.6 }} {...props} />,
                  h3: ({node, ...props}) => <h3 className={`mt-10 mb-6 font-bold ${themeConfig.accentClass || themeConfig.textClass}`} style={{ fontSize: fontSize * 1.3 }} {...props} />,
                  p: ({node, ...props}) => <p className={`leading-[2] mb-8 ${themeConfig.textClass}`} style={{ fontSize: fontSize }} {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc pl-12 mb-8 space-y-4 leading-[1.8]" {...props} />,
                  ol: ({node, ...props}) => <ol className="list-decimal pl-12 mb-8 space-y-4 leading-[1.8]" {...props} />,
                  li: ({node, ...props}) => <li className={themeConfig.textClass} style={{ fontSize: fontSize }} {...props} />,
                  blockquote: ({node, ...props}) => (
                    <blockquote className={`border-l-8 pl-8 py-2 my-10 italic opacity-90 ${themeConfig.borderClass ? 'border-current' : 'border-current'} ${themeConfig.accentClass || ''}`} style={{ fontSize: fontSize }} {...props} />
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
        </div>

        {/* Footer */}
        <div className={`absolute bottom-0 left-0 w-full p-12 text-center text-2xl tracking-widest z-10 ${themeConfig.footerClass}`}>
          {teamName}
        </div>
      </div>
    );
  }
);

XhsCard.displayName = 'XhsCard';
