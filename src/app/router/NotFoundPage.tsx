import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/Feedback';

export function NotFoundPage() {
  return (
    <EmptyState
      className="py-24"
      icon={<Compass className="size-6" />}
      title="Page not found"
      description="The page you are looking for does not exist or was moved."
      action={
        <Link to="/">
          <Button variant="secondary">Go to dashboard</Button>
        </Link>
      }
    />
  );
}
