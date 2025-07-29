from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_community.vectorstores import Qdrant

# Later, extras can be used to store additional metadata about the student
# for example grades, their name, program, profile interests etc.
def student_to_vector(text, extras:dict = None):
    embedder = FastEmbedEmbeddings()
    vector = embedder.embed_query(text)

    # add metadata
    for key, value in (extras or {}).items():
        # for now, the weighting is relatively light and abitrary, we will potentially 
        # add a more sophisticated weighting scheme later
        vector += hash(f"{key}:{value}") % 997 * 1e-5

    return vector
