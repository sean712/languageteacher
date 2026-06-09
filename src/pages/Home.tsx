import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md">
        <h1 className="text-3xl sm:text-4xl font-semibold text-brand-700">
          Lingua
        </h1>
        <p className="mt-4 text-base text-gray-600 dark:text-gray-300">
          Language-learning activities, generated from your favourite teachers'
          YouTube videos.
        </p>
        <p className="mt-8 text-sm text-gray-500">
          Visit a teacher's page directly, e.g.{' '}
          <Link
            to="/demo-teacher"
            className="text-brand-600 underline underline-offset-2"
          >
            /demo-teacher
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
