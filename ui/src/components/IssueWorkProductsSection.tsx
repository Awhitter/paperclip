import {
  Code2,
  ExternalLink,
  FileText,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Globe,
  Image,
  Link as LinkIcon,
  Package,
} from "lucide-react";
import type { IssueWorkProduct } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function isSafeExternalUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function displayLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    cloudinary: "Cloudinary",
    github: "GitHub",
    paperclip: "Paperclip",
    s3: "S3",
    vercel: "Vercel",
  };
  return labels[provider.toLowerCase()] ?? displayLabel(provider);
}

function workProductTypeLabel(type: string) {
  return displayLabel(type);
}

function workProductStatusTone(status: string) {
  if (status === "failed" || status === "changes_requested") return "destructive";
  if (status === "active" || status === "approved" || status === "merged" || status === "ready_for_review") {
    return "default";
  }
  return "secondary";
}

function WorkProductIcon({ product }: { product: IssueWorkProduct }) {
  const className = "h-4 w-4 shrink-0";
  if (product.type === "preview_url") return <Globe className={className} />;
  if (product.provider.toLowerCase() === "cloudinary") return <Image className={className} />;
  if (product.type === "runtime_service") return <Code2 className={className} />;
  if (product.type === "pull_request") return <GitPullRequest className={className} />;
  if (product.type === "branch") return <GitBranch className={className} />;
  if (product.type === "commit") return <GitCommit className={className} />;
  if (product.type === "document") return <FileText className={className} />;
  if (product.url) return <LinkIcon className={className} />;
  return <Package className={className} />;
}

function WorkProductBody({ product, linked }: { product: IssueWorkProduct; linked: boolean }) {
  const title = product.title || workProductTypeLabel(product.type);
  const host = linked && product.url ? new URL(product.url).host : null;
  const statusTone = workProductStatusTone(product.status);

  return (
    <>
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/45 text-muted-foreground">
          <WorkProductIcon product={product} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{title}</span>
            {linked ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">
              {workProductTypeLabel(product.type)}
            </Badge>
            <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
              {providerLabel(product.provider)}
            </Badge>
            <Badge
              variant={statusTone}
              className={cn(
                "h-5 rounded-md px-1.5 text-[10px]",
                statusTone === "default" && "bg-emerald-600 text-white",
              )}
            >
              {displayLabel(product.status)}
            </Badge>
            {product.isPrimary ? (
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">
                Primary
              </Badge>
            ) : null}
            {product.healthStatus !== "unknown" ? (
              <Badge
                variant={product.healthStatus === "healthy" ? "outline" : "destructive"}
                className="h-5 rounded-md px-1.5 text-[10px]"
              >
                {displayLabel(product.healthStatus)}
              </Badge>
            ) : null}
          </div>
          {product.summary ? (
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{product.summary}</p>
          ) : null}
          {host ? <p className="truncate text-[11px] text-muted-foreground">{host}</p> : null}
          {!linked && product.url ? (
            <p className="break-all font-mono text-[11px] leading-4 text-muted-foreground">{product.url}</p>
          ) : null}
        </div>
      </div>
    </>
  );
}

export function IssueWorkProductsSection({ workProducts }: { workProducts: IssueWorkProduct[] }) {
  if (workProducts.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Work products">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">Work products</h3>
        <span className="text-xs text-muted-foreground">{workProducts.length}</span>
      </div>
      <div className="grid gap-2">
        {workProducts.map((product) => {
          const linked = isSafeExternalUrl(product.url);
          const cardClassName =
            "block rounded-lg border border-border bg-card/45 p-3 transition-colors hover:bg-accent/35";

          return linked ? (
            <a
              key={product.id}
              href={product.url!}
              target="_blank"
              rel="noreferrer"
              className={cardClassName}
              data-testid="issue-work-product"
            >
              <WorkProductBody product={product} linked />
            </a>
          ) : (
            <div key={product.id} className={cardClassName} data-testid="issue-work-product">
              <WorkProductBody product={product} linked={false} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
