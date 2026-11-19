use anyhow::{Context, Result, bail, ensure};
use eu5app::game_data::optimized::TILES_ENTRY;
use pdx_map::{HemisphereLength, R16, WorldRows, WorldTiles};
use rawzip::{CompressionMethod, ZipArchive, ZipArchiveWriter};
use std::{io::Write, path::Path};

/// Repack a legacy EU5 map bundle without the game installation.
pub fn retile_map(input: &Path, output: &Path) -> Result<()> {
    let archive = ZipArchive::from_slice(std::fs::read(input)?)?;
    let size = eu5app::hemisphere_size();
    let mut layers = [None, None];
    let mut metadata = None;
    for entry in archive.entries() {
        let entry = entry?;
        let size_hint = entry.uncompressed_size_hint();
        let data = archive.get_entry(entry.wayfinder())?;
        match entry.file_path().as_bytes() {
            b"world_meta.bin" => {
                ensure!(size_hint <= 3, "Invalid EU5 map metadata length");
                let mut bytes = vec![0; size_hint as usize];
                pdx_zstd::decode_to(data.data(), &mut bytes)?;
                metadata = Some(bytes);
            }
            b"locations-0.r16" | b"locations-1.r16" => {
                let index = usize::from(entry.file_path().as_bytes()[10] - b'0');
                let pixels = size.area() as usize;
                ensure!(
                    size_hint == (pixels * 2) as u64,
                    "Invalid EU5 map dimensions"
                );
                ensure!(layers[index].is_none(), "Duplicate EU5 hemisphere");
                let mut locations = vec![R16::new(0); pixels];
                pdx_zstd::decode_to(data.data(), bytemuck::cast_slice_mut(&mut locations))?;
                layers[index] = Some(locations);
            }
            _ => {}
        }
    }
    let [Some(west), Some(east)] = layers else {
        bail!("The EU5 map bundle does not contain both legacy hemispheres");
    };
    let rows = WorldRows::new(0, &west, &east, HemisphereLength::new(size.width));
    let tiles = WorldTiles::from_rows(rows);
    let mut archive = ZipArchiveWriter::new(Vec::new());
    if let Some(metadata) = metadata {
        write_entry(&mut archive, "world_meta.bin", &metadata)?;
    }
    write_entry(&mut archive, TILES_ENTRY, &tiles.to_le_bytes())?;
    let bytes = archive.finish()?;
    std::fs::write(output, bytes).with_context(|| format!("Could not write {}", output.display()))
}

fn write_entry<W: Write>(
    archive: &mut ZipArchiveWriter<W>,
    name: &str,
    bytes: &[u8],
) -> Result<()> {
    let (mut entry, config) = archive
        .new_file(name)
        .compression_method(CompressionMethod::ZSTD)
        .start()?;
    let encoder = pdx_zstd::Encoder::new(&mut entry, 7)?;
    let mut writer = config.wrap(encoder);
    writer.write_all(bytes)?;
    let (encoder, descriptor) = writer.finish()?;
    encoder.finish()?;
    entry.finish(descriptor)?;
    Ok(())
}
