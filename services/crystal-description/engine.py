"""Structure description; scientific logic independent of Streamlit."""
import warnings
from importlib.metadata import version
from pymatgen.core import Structure, Lattice
from pymatgen.symmetry.analyzer import SpacegroupAnalyzer


def example_structure():
    # Idealized rutile teaching example, not downloaded MP data.
    return Structure.from_spacegroup(136, Lattice.tetragonal(4.737, 3.186),
                                    ['Sn', 'O'], [[0, 0, 0], [0.306, 0.306, 0]])


def parse_cif(text):
    if not text.strip() or len(text.encode('utf-8')) > 1_000_000:
        raise ValueError('Please provide a nonempty CIF smaller than 1 MB.')
    return Structure.from_str(text, fmt='cif')


def describe_structure(structure, symprec=0.01):
    if not structure.is_ordered:
        raise ValueError('Disordered structures are not supported. / 暂不支持部分占位的无序结构。')
    if not 1 <= len(structure) <= 100:
        raise ValueError('Please use a structure with 1–100 sites. / 请使用 1–100 个原子位点的结构。')
    if not structure.is_valid():
        raise ValueError('Structure contains overlapping sites. / 结构存在过近或重叠位点。')
    if not 0.001 <= symprec <= 0.1:
        raise ValueError('Symmetry tolerance must be between 0.001 and 0.1 Å.')
    from robocrys import StructureCondenser, StructureDescriber
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always')
        condensed = StructureCondenser(symprec=symprec).condense_structure(structure)
        description = StructureDescriber().describe(condensed)
        symmetry = SpacegroupAnalyzer(structure, symprec=symprec)
        return {
            'formula': structure.composition.reduced_formula,
            'sites': len(structure), 'space_group': symmetry.get_space_group_symbol(),
            'crystal_system': symmetry.get_crystal_system(),
            'description': description,
            'lattice_abc_angstrom': list(structure.lattice.abc),
            'symprec_angstrom': symprec,
            'warnings': list(dict.fromkeys(str(w.message) for w in caught)),
            'versions': {p: version(p) for p in ['robocrys','pymatgen','spglib']},
            'oxidation_note': 'No oxidation states are guessed by this tool. Input formal oxidation states are not experimental measurements.',
        }
