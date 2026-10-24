import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import type { Application, ApplicationInput, ApplicationList } from '@/lib/api/types'
import { useLang } from '@/i18n'

/**
 * The farmer's tracked scheme applications (GET/PUT/DELETE /applications).
 * Saved on the server, encrypted like the profile; the brief reminds about
 * near last dates, so changes here also refresh the brief.
 */
export function useApplications() {
  const { lang } = useLang()
  const qc = useQueryClient()
  const key = ['applications', lang] as const

  const list = useQuery<ApplicationList, Error>({ queryKey: key, queryFn: () => api.getApplications(lang) })

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['applications'] })
    void qc.invalidateQueries({ queryKey: ['brief'] })
  }

  const save = useMutation<Application, Error, { schemeId: string; body: ApplicationInput }>({
    mutationFn: ({ schemeId, body }) => api.putApplication(schemeId, body, lang),
    onSuccess: (app) => {
      qc.setQueryData<ApplicationList>(key, (cur) =>
        cur ? { applications: [app, ...cur.applications.filter((a) => a.schemeId !== app.schemeId)] } : { applications: [app] },
      )
      refresh()
    },
  })

  const remove = useMutation<unknown, Error, string>({
    mutationFn: (schemeId) => api.deleteApplication(schemeId),
    onSuccess: refresh,
  })

  const byId = (id: string) => list.data?.applications.find((a) => a.schemeId === id)

  /** The full stored input for an application, with `patch` applied (PUT replaces the record). */
  const inputOf = (a: Application, patch: Partial<ApplicationInput> = {}): ApplicationInput => ({
    status: a.status,
    docsReady: a.docsReady,
    appliedOn: a.appliedOn,
    referenceNo: a.referenceNo,
    lastDate: a.lastDate,
    note: a.note,
    ...patch,
  })

  return { list, save, remove, byId, inputOf }
}
