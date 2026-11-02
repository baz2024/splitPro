import { buttonVariants } from '@heroui/react';
import { PlusIcon } from 'lucide-react';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import React from 'react';

import { CreateGroup } from '~/components/group/CreateGroup';
import MainLayout from '~/components/Layout/MainLayout';
import { ProjectCard } from '~/components/Project/ProjectCard';
import { useTzOffset } from '~/components/Project/format';
import { Button } from '~/components/ui/button';
import { type NextPageWithUser } from '~/types';
import { api } from '~/utils/api';
import { withI18nStaticProps } from '~/utils/i18n/server';

const ProjectsPage: NextPageWithUser = () => {
  const { t } = useTranslation('projects');
  const tzOffset = useTzOffset();
  const projectsQuery = api.project.list.useQuery({ tzOffset });

  return (
    <>
      <Head>
        <title>{t('title')}</title>
      </Head>
      <MainLayout
        title={t('title')}
        loading={projectsQuery.isPending}
        actions={
          <CreateGroup>
            <Button variant="ghost" size="icon" aria-label={t('list.create_group')}>
              <PlusIcon />
            </Button>
          </CreateGroup>
        }
      >
        <div className="flex flex-col gap-3 pb-8">
          <p className="text-muted text-sm">{t('list.intro')}</p>
          {projectsQuery.isError ? (
            <p className="text-danger text-sm">{t('errors.load_failed')}</p>
          ) : null}
          {projectsQuery.data && 0 === projectsQuery.data.length ? (
            <div className="mt-10 flex flex-col items-center gap-4 text-center">
              <p className="text-muted text-sm">{t('list.empty')}</p>
              <Link href="/groups" className={buttonVariants({ variant: 'primary' })}>
                {t('list.create_group')}
              </Link>
            </div>
          ) : null}
          {projectsQuery.data?.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </MainLayout>
    </>
  );
};

ProjectsPage.auth = true;

export default ProjectsPage;

export const getStaticProps = withI18nStaticProps(['common', 'projects', 'currencies']);
