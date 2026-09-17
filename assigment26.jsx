import { useState } from "react";

// Sample data — swap this out for your real posts / API call
const SAMPLE_POSTS = [
  { id: 1, title: "nodejs", excerpt: "Getting started with Node.js on the backend." },
  { id: 2, title: "react hooks", excerpt: "useState, useEffect, and friends explained." },
  { id: 3, title: "css grid", excerpt: "Building layouts without fighting flexbox." },
];

function NavBar({ onLogout }) {
  return (
    <nav className="flex items-center gap-6 border-b border-gray-200 bg-white px-6 py-4">
      <h1 className="text-xl font-semibold text-gray-900">React Blog</h1>

      <div className="flex items-center gap-6">
        <button
          type="button"
          className="rounded-md bg-blue-600 px-5 py-2 font-medium text-white transition-colors hover:bg-blue-700"
        >
          Home
        </button>

        <button
          type="button"
          className="font-medium text-gray-700 transition-colors hover:text-gray-900"
        >
          Create Post
        </button>
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="ml-auto rounded-md bg-red-500 px-5 py-2 font-medium text-white transition-colors hover:bg-red-600"
      >
        Logout
      </button>
    </nav>
  );
}

function SearchResults({ results, onSelect }) {
  if (results.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1">
      {results.map((post) => (
        <li key={post.id}>
          <button
            type="button"
            onClick={() => onSelect(post)}
            className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
          >
            {post.title}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function ReactBlog({ posts = SAMPLE_POSTS }) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState(null);

  const results = submittedQuery
    ? posts.filter((post) =>
        post.title.toLowerCase().includes(submittedQuery.toLowerCase())
      )
    : [];

  function handleSearch(e) {
    e.preventDefault();
    setSubmittedQuery(query.trim());
    setSelectedPost(null);
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <NavBar onLogout={() => console.log("logout")} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Blog Posts
          </h2>

          <form onSubmit={handleSearch} className="space-y-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search posts..."
              className="w-full rounded-md border border-blue-800 px-4 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-blue-400"
            />

            <button
              type="submit"
              className="w-full rounded-md bg-gradient-to-b from-sky-400 to-blue-500 py-2.5 font-medium text-white transition-opacity hover:opacity-90"
            >
              Search
            </button>
          </form>

          <SearchResults results={results} onSelect={setSelectedPost} />

          {submittedQuery && results.length === 0 && (
            <p className="mt-3 text-sm text-gray-500">
              No posts match "{submittedQuery}".
            </p>
          )}

          {selectedPost && (
            <div className="mt-6 border-t border-gray-100 pt-4">
              <h3 className="font-semibold text-gray-900">
                {selectedPost.title}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                {selectedPost.excerpt}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}