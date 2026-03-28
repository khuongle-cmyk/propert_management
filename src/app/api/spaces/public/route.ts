import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('bookable_spaces')
      .select(`
        id, name, space_type, capacity,
        floor, room_number, hourly_price,
        size_m2,
        space_status, is_published,
        requires_approval,
        amenity_projector,
        amenity_whiteboard,
        amenity_video_conferencing,
        amenity_kitchen_access,
        amenity_parking,
        amenity_natural_light,
        amenity_air_conditioning,
        amenity_standing_desk,
        amenity_phone_booth,
        amenity_reception_service,
        properties (
          id, name, address, 
          postal_code, city
        )
      `)
      .eq('is_published', true)
      .in('space_status', ['available', 'vacant'])
      .order('name')

    if (error) {
      console.error('Spaces error:', error)
      return NextResponse.json(
        { error: error.message }, 
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message }, 
      { status: 500 }
    )
  }
}
