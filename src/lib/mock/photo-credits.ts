/**
 * Licensed stand-in photographs from Wikimedia Commons used by the mock data
 * and the site hero. Replace with landlords' own uploads and the site's own shots.
 */
export interface PhotoCredit {
  file: string;
  author: string;
  licence: string;
  url: string;
}

const commons = (name: string) => `https://commons.wikimedia.org/wiki/File:${name}`;

export const MOCK_PHOTO_CREDITS: PhotoCredit[] = [
  { file: 'quy-nhon/beach-promenade.webp', author: 'VeeWin', licence: 'CC BY-SA 4.0', url: commons('Quy_Nhon_Beach_Promenade.jpg') },
  { file: 'rooms/balcony-sea-view.webp', author: 'Jesse Davis', licence: 'CC BY 2.0', url: commons('Balcony_of_our_apartment_(14488614300).jpg') },
  { file: 'rooms/bare-room-window-ac.webp', author: 'aismallard', licence: 'CC BY-SA 3.0', url: commons('Empty_apartment_room_with_extension_cord.jpg') },
  { file: 'rooms/bathroom-white.webp', author: 'KPNO/NOIRLab/NSF/AURA/P. Delligati', licence: 'CC BY 4.0', url: commons('Dormitories_at_Kitt_Peak_(Dorm-Room-2-Bathroom-CC).jpg') },
  { file: 'rooms/bedroom-bright.webp', author: 'Tim Collins', licence: 'CC BY-SA 3.0', url: commons('Bedroom_Mitcham.jpg') },
  { file: 'rooms/bedroom-teal.webp', author: 'Shixart1985', licence: 'CC BY 2.0', url: commons('Cozy_bedroom_with_a_large_bed_and_simple_decor_in_a_modern_home.jpg') },
  { file: 'rooms/kitchen-fan.webp', author: 'Mr.ちゅらさん', licence: 'CC BY 4.0', url: commons('Dining_Kitchen_at_Naka-Konoike_Public_Housing_Higashi-Osaka.jpg') },
  { file: 'rooms/kitchen-island.webp', author: 'F ASTILY', licence: 'CC BY-SA 4.0', url: commons('Apartment_Kitchen_1_2018-09-28.jpg') },
  { file: 'rooms/kitchen-tiled.webp', author: '玄史生', licence: 'CC0', url: commons('Kitchen_in_Apartment_Apartment_at_Songshan_District,_Taipei_20170301a.jpg') },
  { file: 'rooms/living-room-blue.webp', author: 'Atwngirl', licence: 'CC BY-SA 4.0', url: commons('2022_-_Americus_Hotel_-_Efficiency_Apartment_-_Allentown_PA.jpg') },
  { file: 'rooms/living-room-sofa.webp', author: 'SallyKerr', licence: 'CC0', url: commons('Spitalfields_London_Flat_April_2021.jpg') },
  { file: 'rooms/mini-room-bunk.webp', author: 'Shixart1985', licence: 'CC BY 2.0', url: commons('Modern_bedroom_with_bunked_bed_and_small_table_with_chairs_next_to_a_tv_on_the_wall.jpg') },
  { file: 'rooms/room-tall-window.webp', author: 'Smiley.toerist', licence: 'CC BY-SA 4.0', url: commons('Hotel_room_Tours_2.jpg') },
  { file: 'rooms/shared-bunks.webp', author: 'LorfHostelsChain', licence: 'CC BY-SA 4.0', url: commons('Typical_dorm_room.jpg') },
  { file: 'rooms/single-room-desk.webp', author: 'Packer1028', licence: 'CC0', url: commons('Single_dorm_room,_UVA.jpg') },
  { file: 'rooms/studio-desk-bed.webp', author: 'Allvin Garamar', licence: 'CC BY-SA 4.0', url: commons('EXECUTIVE_ROOM_-_Teraskita_Hotel_Makassar.jpg') },
  { file: 'rooms/studio-plants.webp', author: 'Aaaatu', licence: 'CC BY-SA 4.0', url: commons('Studio_apartment_in_Finland.jpg') },
];
