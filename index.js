const express = require("express");
const TorrentSearchApi = require("torrent-search-api");
const cors = require("cors");
const TorrentIndexer = require("torrent-indexer");
const torrentIndexer = new TorrentIndexer();

const port = 3001;

const app = express();
app.use(cors());

const torrent_search = async (Search, Category) => {
  TorrentSearchApi.enablePublicProviders();

  let torrents = await TorrentSearchApi.search(Search, Category);
  let magnet = null;

  torrents = await Promise.all(
    torrents
      .map(async item => {
        if (item.hasOwnProperty("provider")) {
          if (!item.hasOwnProperty("magnet")) {
            magnet = await TorrentSearchApi.getMagnet(item);
          }
          return {
            ...item,
            ...(magnet && { magnet })
          };
        } else {
          return null;
        }
      })
      .filter(item => item.hasOwnProperty("magnet") && item.seeds > 10 && item.peers > 10)
      .sort((a, b) => b.seeds + b.peers - (a.seeds + a.peers))
  );

  return torrents;
};

app.get("/Movies", async (req, res) => {
  try {
    let Search = req.query.Search;
    const Category = req.query.Category;
    const Language = req.query.Language;
    const Episode = parseInt(req.query.Episode);
    const Season = parseInt(req.query.Season);
    const Year = req.query.Year;
    let Quality = req.query.Quality;

    if (Language) {
      Search = `${Search} ${Language}`;
    }
    if (Episode) {
      Search = `${Search} ${Season <= 9 ? "S0" + Season : "S" + Episode}${Episode <= 9 ? "E0" + Episode : "E" + Episode}`;
    }
    if (Year) {
      Search = `${Search} ${Year}`;
    }
    if (Quality) {
      //   Search = `${Search} ${Quality}p`;
      Quality = `${Quality}p`;
    }

    let torrents = await torrentIndexer.search(Search, Category);

    if (Language) {
      SearchWithoutLanguage = await Search.replace(Language, "");
      let torrentsWithoutLanguage = await torrentIndexer.search(SearchWithoutLanguage, Category);
      torrents = await [...torrents, ...torrentsWithoutLanguage];
    }

    if (Episode) {
      SearchWithoutEpisode = await Search.replace(Episode, "");
      let torrentsWithoutEpisode = await torrentIndexer.search(SearchWithoutEpisode, Category);
      torrents = await [...torrents, ...torrentsWithoutEpisode];
    }

    let magnetlink = null;

    //Sorting the torrents in descending order with respect to seeders and leechers
    //filtering out the torrents object, which does not contain resolution property
    torrents = await torrents.filter(item => item.hasOwnProperty("resolution") && item.seeders > 10 && item.leechers > 10 && item.resolution === Quality).sort((a, b) => b.seeders + b.leechers - (a.seeders + a.leechers));

    torrents = await Promise.all(
      torrents.map(async item => {
        if (!item.hasOwnProperty("magnet") && item.hasOwnProperty("link")) {
          if (!item.link.startsWith("magnet:")) {
            if (item.link.endsWith(".html")) {
              magnetlink = await torrentIndexer.torrent(item.link);
            } else {
              magnetlink = item.link.substr(32);
              console.log(magnetlink);
            }
            magnetlink = `magnet:?xt=urn:btih:${magnetlink}&dn=${item.fileName.replace(/[^a-zA-Z]/g, "")}&tr=http://track.one:1234/announce&tr=udp://track.two:80`;
          } else {
            magnetlink = item.link;
          }
        }

        return {
          ...item,
          ...(magnetlink && { magnet: magnetlink })
        };
      })
    );

    //Filtering the torrents object which does not contain magnet property
    torrents = await torrents.filter(item => item.hasOwnProperty("magnet"));
    torrents = await torrents.map(({ link, ...rest }) => rest);
    if (!torrents.length) {
      torrents = await torrent_search(Search, Category);
    }

    res.json({ Total_Length: torrents.length, Movies: torrents });
  } catch (error) {
    console.log(error);
    res.json({ Total_Length: 0, Movies: [] });
  }
});

app.listen(port, () => console.log(`localhost running http://localhost:${port}`));
