import { useNavigate, useParams } from 'react-router-dom';

/**
 * Returns a function that navigates to a page's parent if it has one, else
 * the workspace root. Used after archive / trash / delete actions so the
 * user lands somewhere coherent instead of staring at a now-defunct page.
 */
export function useNavigateToParent() {
  const navigate = useNavigate();
  const { wsId = '' } = useParams();
  return (parentId: string | null | undefined) => {
    navigate(parentId ? `/w/${wsId}/i/${parentId}` : `/w/${wsId}`);
  };
}
