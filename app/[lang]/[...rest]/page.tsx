import { notFound } from 'next/navigation';

// With every page under app/[lang]/ and middleware prefixing all requests
// with a locale, unmatched URLs land here - hand them to the segment's
// not-found page so bad links get a proper 404 instead of a Next error.
export default function CatchAll(): never {
  notFound();
}
