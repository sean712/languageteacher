import type {
  TranscriptFetchOutcome,
  TranscriptProvider,
} from './transcript-types.ts';
import { SupadataTranscriptProvider } from './supadata-provider.ts';
import { InnertubeTranscriptProvider } from './innertube-transcript-provider.ts';

// Ordered chain: providers are tried until one returns a transcript.
// Supadata (works from Edge IPs) goes first when its key is configured;
// Innertube is the free fallback (only works from residential IPs — see
// the note in innertube-transcript-provider.ts).
export function getTranscriptProviders(): TranscriptProvider[] {
  const chain: TranscriptProvider[] = [];
  const supadataKey = Deno.env.get('SUPADATA_API_KEY');
  if (supadataKey) chain.push(new SupadataTranscriptProvider(supadataKey));
  chain.push(new InnertubeTranscriptProvider());
  return chain;
}

export async function fetchTranscriptViaChain(
  providers: TranscriptProvider[],
  videoId: string,
): Promise<TranscriptFetchOutcome> {
  const diags: string[] = [];
  for (const provider of providers) {
    const outcome = await provider.fetchTranscript(videoId);
    if (outcome.result) return outcome;
    diags.push(`${provider.name}: ${outcome.diag}`);
  }
  return { result: null, diag: diags.join(' | ') };
}
