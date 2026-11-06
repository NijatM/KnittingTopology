import type { ReferenceId, ScientificReference } from './types';

/** Bibliography for the implemented methods, not a claim of full paper reproduction. */
export const REFERENCES: Record<ReferenceId, ScientificReference> = {
  lipman2014: {
    id: 'lipman2014',
    type: 'article-journal',
    title: 'Bijective Mappings of Meshes with Boundary and the Degree in Mesh Processing',
    authors: [{ given: 'Yaron', family: 'Lipman' }],
    year: 2014,
    containerTitle: 'SIAM Journal on Imaging Sciences',
    volume: '7',
    issue: '2',
    pages: '1263–1283',
    doi: '10.1137/130939754',
    url: 'https://doi.org/10.1137/130939754',
    pdfUrl: 'https://arxiv.org/pdf/1310.0955',
    accessed: '2026-11-06',
    verificationNote:
      'Publication metadata verified against SIAM. Theorem 1 appears on pages 3 and 10 of the public arXiv preprint. It motivates the nondegenerate, consistent-orientation and bijective-boundary checks; this project does not implement the paper’s optimization or an exact-predicate certificate.',
  },
  takayama2014: {
    id: 'takayama2014',
    type: 'article-journal',
    title: 'Pattern-Based Quadrangulation for N-Sided Patches',
    authors: [
      { given: 'Kenshi', family: 'Takayama' },
      { given: 'Daniele', family: 'Panozzo' },
      { given: 'Olga', family: 'Sorkine-Hornung' },
    ],
    year: 2014,
    containerTitle: 'Computer Graphics Forum',
    volume: '33',
    issue: '5',
    pages: '177–184',
    doi: '10.1111/cgf.12443',
    url: 'https://doi.org/10.1111/cgf.12443',
    pdfUrl: 'https://igl.ethz.ch/projects/patch-quad/pattern-based-quadrangulation.pdf',
    accessed: '2026-11-06',
    verificationNote:
      'Authors, venue and pages verified against the ETH IGL bibliography; DOI independently verified against Wiley. The public author PDF has eight pages, corresponding to printed pages 177–184.',
  },
  oval2018: {
    id: 'oval2018',
    type: 'paper-conference',
    title: 'Topology Finding of Structural Patterns',
    authors: [
      { given: 'Robin', family: 'Oval' },
      { given: 'Matthias', family: 'Rippmann' },
      { given: 'Romain', family: 'Mesnil' },
      { given: 'Tom', family: 'Van Mele' },
      { given: 'Olivier', family: 'Baverel' },
      { given: 'Philippe', family: 'Block' },
    ],
    year: 2018,
    containerTitle: 'Advances in Architectural Geometry 2018',
    pages: '342–363',
    publisher: 'Klein Publishing GmbH',
    url: 'https://hal.science/hal-01883505',
    proceedingsUrl: 'https://research.chalmers.se/publication/504188/file/504188_Fulltext.pdf',
    pdfUrl:
      'https://block.arch.ethz.ch/brg/files/OVAL2018__AAG_topology-finding-of-structural-patterns_1542733947.pdf',
    accessed: '2026-11-06',
    verificationNote:
      'Authors and final pages verified in the Chalmers-hosted proceedings linked above. Locators use final printed pages, not the differently paginated author manuscript. No chapter DOI verified.',
  },
  hart: {
    id: 'hart',
    type: 'webpage',
    title: 'Conway Notation for Polyhedra',
    authors: [{ given: 'George W.', family: 'Hart' }],
    url: 'https://www.georgehart.com/virtual-polyhedra/conway_notation.html',
    interactiveUrl: 'https://georgehart.com/conway/',
    accessed: '2026-11-06',
    verificationNote:
      'Undated explanatory web resource. The footer says ©1998; this is not treated as a publication year. Hart credits John Conway for the notation and himself for the page’s algorithms and presentation. The modern interactive page is linked separately.',
  },
};
