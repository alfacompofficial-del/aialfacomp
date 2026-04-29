import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

export function Markdown({ content }: { content: string }) {
  return (
    <div className="nx-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }: any) {
            const text = String(children).replace(/\n$/, "");
            if (inline) {
              return <code className={className} {...props}>{children}</code>;
            }
            const match = /language-(\w+)/.exec(className || "");
            return <CodeBlock language={match?.[1] || ""} code={text} />;
          },
          pre({ children }: any) {
            return <>{children}</>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
