import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import fs from 'fs'
import path from 'path'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('supabaseAdmin:', supabaseAdmin)
    console.log('typeof supabaseAdmin:', typeof supabaseAdmin)
    
    const { prompt = 'test upload' } = req.body || {}

    // 1) create DB job
    const { data: job, error: insertErr } = await supabaseAdmin
      .from('video_jobs')
      .insert([{ prompt, status: 'uploading' }])
      .select('*')
      .single()
    if (insertErr) throw insertErr

    // 2) read local file
    const testPath = path.join(process.cwd(), 'test.mp4')
    if (!fs.existsSync(testPath))
      return res.status(400).json({ error: 'Create test.mp4 first' })

    const fileBuffer = fs.readFileSync(testPath)
    const fileName = `video-${job.id}.mp4`

    // 3) upload to Supabase storage
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('videos')
      .upload(fileName, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      })
    if (uploadErr) throw uploadErr

    // 4) build public URL
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/videos/${fileName}`

    // 5) update DB
    await supabaseAdmin
      .from('video_jobs')
      .update({ status: 'done', video_url: url })
      .eq('id', job.id)

    res.json({ jobId: job.id, url })
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
