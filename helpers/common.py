# a collection of useful helper functions for the processors
import re
import io

# derp.ext -> derp_ext_
def makeFilenameSafe(filename):
	return re.sub("\.", "_", filename) + "_"

def clustersToStandardJSON(clusters, assignment, filename, helpers):
	results = []
	for cluster in clusters:
		if cluster.hasCheating():
			results.append(cluster.toJSON())

	json = io.getJSONString(results)
	helpers.writeToPostprocessed(json, assignment, filename)


# only use with a preprocessor or processor
def getPartner(student, assignment, semester, helpers):
	partnerText = helpers.readFromAssignment(student, assignment, "partners.txt")
	partnerText = re.sub(",", " ", partnerText)
	if partnerText != None:
		partnerArray = partnerText.strip().split("\n")
		for line in partnerArray:
			line = line.strip().split(" ")[0]
			if len(line) > 1 and line != student:
				otherSemester = helpers.getSemester(line)
				if otherSemester != None and otherSemester == semester:
					return line
					
	return None

class Member:
	def __init__(self, student, assignment, helpers):
		self.student = student
		self.semester = helpers.getSemester(student)
		self.partner = getPartner(student, assignment, self.semester, helpers)

	def toJSON(self):
		result = {}
		result["student"] = self.student
		result["partner"] = self.partner
		result["semester"] = self.semester
		return result

class Cluster:
	def __init__(self, allowPartners, filename, score):
		self.members = []
		self.allowPartners = allowPartners
		self.file = filename
		self.score = score

	def add(self, newMember):
		for member in self.members:
			if member.student == newMember.student:
				# don't add more than once
				return
		self.members.append(newMember)

	def hasCheating(self):
		if len(self.members) < 2:
			# can't have cheating without at least two people
			return False

		if len(self.members) == 2 and self.allowPartners:
			member1 = self.members[0]
			member2 = self.members[1]
			if member1.partner == None or member2.partner == None:
				# both must have a partner
				return True
			# both must list eachother as partners
			return (member1.student == member2.partner and member2.student == member1.partner) == False

		# 3 or more is cheating
		return True

	def toJSON(self):
		# return JSON serialiazble form
		result = {}
		result["allowPartners"] = self.allowPartners
		result["file"] = self.file
		result["score"] = self.score
		result["members"] = []
		for member in self.members:
			result["members"].append(member.toJSON())
		return result