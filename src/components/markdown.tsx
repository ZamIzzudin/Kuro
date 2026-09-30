'use client'

// Renderer Markdown bersama untuk deskripsi Sprint / Task / Subtask.
// HTML hasil konversi disanitasi (rehype-sanitize) → aman dari XSS.
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body text-[13.5px] leading-relaxed text-ink-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" className="font-semibold text-brand-1 underline" />
          ),
          h1: ({ ...props }) => <h1 className="mt-4 mb-2 font-heading text-[17px] font-extrabold text-ink-900" {...props} />,
          h2: ({ ...props }) => <h2 className="mt-4 mb-2 font-heading text-[15px] font-extrabold text-ink-900" {...props} />,
          h3: ({ ...props }) => <h3 className="mt-3 mb-1.5 font-heading text-[14px] font-bold text-ink-900" {...props} />,
          p: ({ ...props }) => <p className="mb-2.5 last:mb-0" {...props} />,
          ul: ({ ...props }) => <ul className="mb-2.5 ml-5 list-disc space-y-1" {...props} />,
          ol: ({ ...props }) => <ol className="mb-2.5 ml-5 list-decimal space-y-1" {...props} />,
          code: ({ ...props }) => (
            <code
              className="rounded bg-surface-2 px-1.5 py-0.5 text-[12.5px] text-ink-900 ring-1 ring-line"
              {...props}
            />
          ),
          pre: ({ ...props }) => (
            <pre
              className="mb-2.5 overflow-x-auto rounded-md bg-surface-2 p-3 text-[12.5px] ring-1 ring-line"
              {...props}
            />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="mb-2.5 border-l-2 border-brand-1/40 pl-3 text-ink-500" {...props} />
          ),
          table: ({ ...props }) => (
            <div className="mb-2.5 overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]" {...props} />
            </div>
          ),
          th: ({ ...props }) => (
            <th className="border border-line bg-surface-2 px-2 py-1 text-left font-bold" {...props} />
          ),
          td: ({ ...props }) => <td className="border border-line px-2 py-1" {...props} />,
          hr: ({ ...props }) => <hr className="my-3 border-line" {...props} />,
          input: ({ ...props }) => <input {...props} className="mr-1.5 align-middle" readOnly />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
